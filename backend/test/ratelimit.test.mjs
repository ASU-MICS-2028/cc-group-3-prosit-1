// Phase 8: per-IP rate limiting. The harness relaxes the limits for the other suites; this file opts in.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './harness.ts'

const servers = []

async function start(options) {
  const server = await createApp(options)
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const base = `http://localhost:${server.address().port}`

  async function call(method, path, { body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : undefined, headers: response.headers }
  }

  return { call }
}

afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

describe('rate limiting', () => {
  it('returns 429, with Retry-After, once the per-IP limit is passed', async () => {
    const { call } = await start({ rateLimit: { windowMs: 60_000, max: 3, authMax: 100 } })
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await call('GET', '/')).status)
    expect(statuses).toEqual([200, 200, 200, 429])

    const limited = await call('GET', '/')
    expect(limited.body).toMatchObject({ error: 'rate_limited' })
    expect(limited.headers.get('retry-after')).toBeTruthy()
  })

  it('exempts the health and readiness probes', async () => {
    const { call } = await start({ rateLimit: { windowMs: 60_000, max: 1, authMax: 1 } })
    for (let i = 0; i < 5; i++) expect((await call('GET', '/health')).status).toBe(200)
    expect((await call('GET', '/ready')).status).toBe(200)
  })

  it('applies the stricter limit to the sign-in routes', async () => {
    const { call } = await start({ rateLimit: { windowMs: 60_000, max: 100, authMax: 2 } })
    const statuses = []
    for (let i = 0; i < 3; i++) statuses.push((await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })).status)
    expect(statuses).toEqual([200, 200, 429])
  })
})
