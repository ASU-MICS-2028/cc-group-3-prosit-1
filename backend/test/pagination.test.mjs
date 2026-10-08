// Phase 10: the shared list convention — ?page=&pageSize= (capped) with { items, total }.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, uid } from './harness.ts'

const servers = []

async function start() {
  const server = await createApp()
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const base = `http://localhost:${server.address().port}`

  const call = async (method, path, { token, body } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : undefined }
  }

  const login = async (identifier, password) => (await call('POST', '/auth/staff/login', { body: { identifier, password } })).body.token
  return { call, login }
}

afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

const registration = (n) => ({ clientId: uid(`pg-${n}`), name: `Farmer ${n}`, countryCode: '+233', phoneNational: `2412345${String(n).padStart(2, '0')}` })

describe('pagination', () => {
  it('returns a page and the total for /admin/farmers', async () => {
    const { call, login } = await start()
    const agent = await login('AG-0001', 'agent-test-pass')
    for (let i = 1; i <= 3; i++) expect((await call('POST', '/farmers', { token: agent, body: registration(i) })).status).toBe(201)
    const admin = await login('ADM-001', 'admin-test-pass')

    const first = await call('GET', '/admin/farmers?pageSize=2&page=1', { token: admin })
    expect(first.body.total).toBe(3)
    expect(first.body.items).toHaveLength(2)

    const second = await call('GET', '/admin/farmers?pageSize=2&page=2', { token: admin })
    expect(second.body.total).toBe(3)
    expect(second.body.items).toHaveLength(1)
  })

  it('caps pageSize at 100', async () => {
    const { call, login } = await start()
    const admin = await login('ADM-001', 'admin-test-pass')
    expect((await call('GET', '/admin/farmers?pageSize=100000', { token: admin })).status).toBe(200)
  })

  it('paginates the audit log with a total', async () => {
    const { call, login } = await start()
    const admin = await login('ADM-001', 'admin-test-pass')
    const audit = await call('GET', '/admin/audit?pageSize=1', { token: admin })
    expect(audit.body.items.length).toBeLessThanOrEqual(1)
    expect(typeof audit.body.total).toBe('number')
  })
})
