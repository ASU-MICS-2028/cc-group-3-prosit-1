// Phase 1 foundation: health/ready, security headers, request ids, error ids, config validation.
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, validateConfig } from '../src/config.js'
import { errorHandler } from '../src/http.js'
import { createApp } from './harness.ts'

const servers = []

async function start(options) {
  const server = await createApp(options)
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const base = `http://localhost:${server.address().port}`

  async function call(method, path, { headers, body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : undefined, headers: response.headers }
  }

  return { server, base, call }
}

afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

describe('health and readiness', () => {
  it('answers /health for liveness', async () => {
    const { call } = await start()
    expect(await call('GET', '/health')).toMatchObject({ status: 200, body: { status: 'ok' } })
  })

  it('answers /ready when the database answers', async () => {
    const { call } = await start()
    expect(await call('GET', '/ready')).toMatchObject({ status: 200, body: { status: 'ready' } })
  })

  it('reports /ready unavailable when the database is down', async () => {
    const { server, call } = await start()
    server.ctx.db = {
      ...server.ctx.db,
      query: async () => {
        throw new Error('database is down')
      },
    }
    expect(await call('GET', '/ready')).toMatchObject({ status: 503, body: { status: 'unavailable' } })
  })
})

describe('security headers', () => {
  it('sets the standard hardening headers', async () => {
    const { headers } = await start().then(({ call }) => call('GET', '/health'))
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBeTruthy()
    expect(headers.get('cross-origin-resource-policy')).toBe('cross-origin')
  })
})

describe('request ids', () => {
  it('echoes an inbound X-Request-Id', async () => {
    const { call } = await start()
    const { headers } = await call('GET', '/health', { headers: { 'X-Request-Id': 'req-abc-123' } })
    expect(headers.get('x-request-id')).toBe('req-abc-123')
  })

  it('generates one when the caller does not send it', async () => {
    const { call } = await start()
    const { headers } = await call('GET', '/health')
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('error responses', () => {
  it('keeps the { error, message } shape for unknown routes', async () => {
    const { call } = await start()
    const { status, body } = await call('GET', '/nope')
    expect(status).toBe(404)
    expect(body).toMatchObject({ error: 'not_found', message: expect.any(String) })
  })

  it('adds an error id and the request id to unexpected failures', () => {
    let captured
    const res = {
      status(code) {
        this.code = code
        return this
      },
      json(body) {
        captured = { code: this.code, body }
        return this
      },
    }
    errorHandler(new Error('boom'), { id: 'req-1' }, res, () => {})
    expect(captured.code).toBe(500)
    expect(captured.body.error).toBe('server_error')
    expect(captured.body.errorId).toMatch(/^[0-9a-f-]{36}$/)
    expect(captured.body.requestId).toBe('req-1')
  })
})

describe('config validation', () => {
  it('fails fast when the database is not configured at all', () => {
    const config = { ...loadConfig({}), databaseUrl: null, dbHost: null, dbSecretArn: null }
    expect(() => validateConfig(config)).toThrow(/DATABASE_URL/)
  })

  it('requires the RDS CA bundle when using DB_HOST', () => {
    const config = { ...loadConfig({}), databaseUrl: null, dbHost: 'db:5432', dbSecretArn: 'arn:secret', dbCaFile: null }
    expect(() => validateConfig(config)).toThrow(/DB_CA_FILE/)
  })

  it('accepts a complete local configuration', () => {
    expect(() => validateConfig(loadConfig({ DATABASE_URL: 'postgres://localhost/agroconnect' }))).not.toThrow()
  })
})
