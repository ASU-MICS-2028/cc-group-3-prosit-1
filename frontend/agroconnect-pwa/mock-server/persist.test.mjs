import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './server.mjs'
import { DEMO_ACCOUNTS, createStore } from './store.mjs'

let dir
const servers = []

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mock-persist-'))
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
  await rm(dir, { recursive: true, force: true })
})

async function boot(dataFile) {
  const server = await createApp({ dataFile })
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
  const login = async (account) => (await call('POST', '/auth/staff/login', { body: { identifier: account.loginId, password: account.password } })).body.token
  return { server, call, login }
}

const farmer = (n) => ({ clientId: `c-${n}`, name: `Farmer ${n}`, countryCode: '+233', phoneNational: `24100000${n}` })

describe('saving the mock\'s data', () => {
  it('keeps farmers, approvals and counters across a restart', async () => {
    const dataFile = join(dir, 'state.json')

    const first = await boot(dataFile)
    const agent = await first.login(DEMO_ACCOUNTS.agent)
    const admin = await first.login(DEMO_ACCOUNTS.admin)
    expect((await first.call('POST', '/farmers', { token: agent, body: farmer(1) })).body.id).toBe('1')
    await first.call('POST', '/admin/agents/U-pending/approve', { token: admin, body: {} })
    await first.server.flush()
    await new Promise((resolve) => first.server.close(resolve))
    servers.length = 0

    const second = await boot(dataFile)
    const adminAgain = await second.login(DEMO_ACCOUNTS.admin)
    const list = await second.call('GET', '/admin/farmers', { token: adminAgain })
    expect(list.body).toMatchObject({ total: 1, items: [{ name: 'Farmer 1' }] })

    const agents = await second.call('GET', '/admin/agents?status=approved', { token: adminAgain })
    expect(agents.body.items.map((a) => a.id)).toContain('U-pending')

    const next = await second.call('POST', '/farmers', { token: await second.login(DEMO_ACCOUNTS.agent), body: farmer(2) })
    expect(next.body.id).toBe('2')
  })

  it('does not keep anything when no data file is given', async () => {
    const first = await boot(undefined)
    await first.call('POST', '/farmers', { token: await first.login(DEMO_ACCOUNTS.agent), body: farmer(1) })
    await new Promise((resolve) => first.server.close(resolve))
    servers.length = 0

    const second = await boot(undefined)
    const list = await second.call('GET', '/admin/farmers', { token: await second.login(DEMO_ACCOUNTS.admin) })
    expect(list.body.total).toBe(0)
  })
})

describe('demo accounts and older data files', () => {
  it('adds any demo account an older saved file lacks, and keeps what was saved', async () => {
    const olderFile = { users: [{ id: 'U-17', role: 'agent', name: 'Saved Agent' }], farmers: [], counters: { user: 17 } }
    const store = await createStore(olderFile)
    expect(store.users.get('U-17').name).toBe('Saved Agent')
    expect([...store.users.keys()]).toEqual(expect.arrayContaining(['U-admin', 'U-coord', 'U-agent', 'U-pending', 'U-farmer']))
  })

  it('does not overwrite a demo account that was already saved', async () => {
    const saved = { users: [{ id: 'U-admin', role: 'admin', name: 'Renamed Admin', passwordHash: 'kept' }] }
    expect((await createStore(saved)).users.get('U-admin')).toMatchObject({ name: 'Renamed Admin', passwordHash: 'kept' })
  })
})

describe('saving the signing key', () => {
  it('lets a token signed before a restart still be accepted after it', async () => {
    const file = join(dir, 'keys.json')

    vi.resetModules()
    const before = await import('./security.mjs')
    expect(await before.loadKeys(file)).toBe('created')
    const token = await before.signToken({ id: 'U-agent', role: 'agent', name: 'Efua' })

    vi.resetModules()
    const after = await import('./security.mjs')
    expect(await after.loadKeys(file)).toBe('loaded')
    expect(after.jwks.keys[0].n).toBe(before.jwks.keys[0].n)
    await expect(after.verifyToken(token)).resolves.toMatchObject({ sub: 'U-agent' })
  })
})
