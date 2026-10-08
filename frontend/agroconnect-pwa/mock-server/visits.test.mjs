// Contract tests for extension visits (API-CONTRACT "Extension visits"). Ported to backend/test.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './server.mjs'
import { DEMO_ACCOUNTS } from './store.mjs'

const servers = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

async function boot() {
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
  const staff = async (account) => (await call('POST', '/auth/staff/login', { body: { identifier: account.loginId, password: account.password } })).body.token
  return { call, agent: () => staff(DEMO_ACCOUNTS.agent), coordinator: () => staff(DEMO_ACCOUNTS.coordinator), admin: () => staff(DEMO_ACCOUNTS.admin) }
}

async function registered(t, token) {
  const { body } = await t.call('POST', '/farmers', { token, body: { clientId: 'vf-1', name: 'Yaw Visit', countryCode: '+233', phoneNational: '245557777' } })
  return body.id
}

const visit = (overrides = {}) => ({ clientId: 'ev-1', visitedAt: '2026-10-08T09:30:00Z', topics: ['pests', 'advice'], notes: 'Fall armyworm on two rows; showed handpicking.', nextVisit: '2026-10-22', ...overrides })

describe('extension visits', () => {
  it('logs a visit once and lists the history newest first', async () => {
    const t = await boot()
    const agent = await t.agent()
    const id = await registered(t, agent)
    expect((await t.call('POST', `/farmers/${id}/visits`, { token: agent, body: visit() })).status).toBe(201)
    const repeat = await t.call('POST', `/farmers/${id}/visits`, { token: agent, body: visit() })
    expect(repeat.status).toBe(200)
    await t.call('POST', `/farmers/${id}/visits`, { token: agent, body: visit({ clientId: 'ev-2', visitedAt: '2026-10-01T09:00:00Z', topics: ['records'], notes: '', nextVisit: null }) })

    const { body } = await t.call('GET', `/farmers/${id}/visits`, { token: await t.coordinator() })
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({ topics: ['pests', 'advice'], nextVisit: '2026-10-22', agentName: 'Efua Agent', visitedAt: '2026-10-08T09:30:00.000Z' })
    expect(body.items[1]).toMatchObject({ topics: ['records'], nextVisit: null })
  })

  it('checks the visit and who may see the farmer', async () => {
    const t = await boot()
    const agent = await t.agent()
    const id = await registered(t, agent)
    const post = (body) => t.call('POST', `/farmers/${id}/visits`, { token: agent, body })
    expect((await post(visit({ clientId: 'ev-3', topics: [] }))).body).toMatchObject({ field: 'topics' })
    expect((await post(visit({ clientId: 'ev-4', topics: ['dancing'] }))).body).toMatchObject({ field: 'topics' })
    expect((await post(visit({ clientId: 'ev-5', notes: 'x'.repeat(501) }))).body).toMatchObject({ field: 'notes' })
    expect((await post(visit({ clientId: 'ev-6', nextVisit: 'next week' }))).body).toMatchObject({ field: 'nextVisit' })
    expect((await t.call('POST', '/farmers/999/visits', { token: agent, body: visit() })).status).toBe(404)
    expect((await t.call('GET', `/farmers/${id}/visits`, { token: await t.admin() })).status).toBe(200)
    expect((await t.call('POST', `/farmers/${id}/visits`, { token: await t.admin(), body: visit({ clientId: 'ev-7' }) })).status).toBe(403)
  })
})
