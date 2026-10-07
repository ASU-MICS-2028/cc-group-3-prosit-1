import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './server.mjs'
import { signToken } from './security.mjs'
import { DEMO_ACCOUNTS } from './store.mjs'

const servers = []

async function start(options) {
  const server = await createApp({ ...options })
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const base = `http://localhost:${server.address().port}`

  async function call(method, path, { token, body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : undefined }
  }

  const staffLogin = async (identifier, password) => call('POST', '/auth/staff/login', { body: { identifier, password } })
  const adminToken = async () => (await staffLogin(DEMO_ACCOUNTS.admin.loginId, DEMO_ACCOUNTS.admin.password)).body.token
  const agentToken = async () => (await staffLogin(DEMO_ACCOUNTS.agent.loginId, DEMO_ACCOUNTS.agent.password)).body.token

  async function farmerToken(phone, pin = '1234') {
    const started = await call('POST', '/auth/farmer/start', { body: { phone } })
    const verified = await call('POST', '/auth/farmer/verify-otp', { body: { phone, code: started.body.testCode, pin } })
    return verified.body.token
  }

  return { base, call, staffLogin, adminToken, agentToken, farmerToken }
}

afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

const registration = (overrides = {}) => ({ clientId: 'c-1', name: 'Ama', phone: '0241234567', ...overrides })

describe('keys', () => {
  it('publishes a public key and never the private part', async () => {
    const { call } = await start()
    const { status, body } = await call('GET', '/.well-known/jwks.json')
    expect(status).toBe(200)
    expect(body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256' })
    expect(body.keys[0]).not.toHaveProperty('d')
  })
})

describe('farmer sign-in', () => {
  it('sends a code, sets the PIN, then asks for the PIN next time', async () => {
    const { call } = await start()
    const started = await call('POST', '/auth/farmer/start', { body: { phone: '024 123 4567' } })
    expect(started.body).toMatchObject({ next: 'otp', expiresInSeconds: 300 })

    const verified = await call('POST', '/auth/farmer/verify-otp', {
      body: { phone: '0241234567', code: started.body.testCode, pin: '4821' },
    })
    expect(verified.status).toBe(200)
    expect(verified.body.user).toMatchObject({ role: 'farmer', phone: '+233241234567' })

    expect((await call('POST', '/auth/farmer/start', { body: { phone: '0241234567' } })).body).toEqual({ next: 'pin' })
    const login = await call('POST', '/auth/farmer/login', { body: { phone: '0241234567', pin: '4821' } })
    expect(login.status).toBe(200)
  })

  it('returns no code when test mode is off', async () => {
    const { call } = await start({ testMode: false })
    const started = await call('POST', '/auth/farmer/start', { body: { phone: '0241234567' } })
    expect(started.body).not.toHaveProperty('testCode')
  })

  it('counts wrong codes, and rejects a PIN that is not 4 digits', async () => {
    const { call } = await start()
    await call('POST', '/auth/farmer/start', { body: { phone: '0241234567' } })
    const wrong = await call('POST', '/auth/farmer/verify-otp', { body: { phone: '0241234567', code: '000000', pin: '1234' } })
    expect(wrong).toMatchObject({ status: 400, body: { error: 'invalid_code', attemptsLeft: 4 } })
    const badPin = await call('POST', '/auth/farmer/verify-otp', { body: { phone: '0241234567', code: '000000', pin: '12' } })
    expect(badPin).toMatchObject({ status: 422, body: { error: 'invalid_pin' } })
  })

  it('rejects an expired code', async () => {
    const clock = { time: 1_000_000 }
    const { call } = await start({ now: () => clock.time })
    const started = await call('POST', '/auth/farmer/start', { body: { phone: '0241234567' } })
    clock.time += 6 * 60_000
    const verified = await call('POST', '/auth/farmer/verify-otp', {
      body: { phone: '0241234567', code: started.body.testCode, pin: '1234' },
    })
    expect(verified).toMatchObject({ status: 410, body: { error: 'code_expired' } })
  })

  it('limits code requests', async () => {
    const { call } = await start()
    for (let i = 0; i < 3; i++) await call('POST', '/auth/farmer/start', { body: { phone: '0241234567' } })
    const fourth = await call('POST', '/auth/farmer/start', { body: { phone: '0241234567' } })
    expect(fourth).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
  })

  it('locks the account after five wrong PINs', async () => {
    const { call, farmerToken } = await start()
    await farmerToken('0241234567', '4821')
    const results = []
    for (let i = 0; i < 6; i++) {
      results.push(await call('POST', '/auth/farmer/login', { body: { phone: '0241234567', pin: '0000' } }))
    }
    expect(results[0]).toMatchObject({ status: 401, body: { error: 'wrong_pin', attemptsLeft: 4 } })
    expect(results[4].body.attemptsLeft).toBe(0)
    expect(results[5]).toMatchObject({ status: 429, body: { error: 'locked' } })
  })
})

describe('staff sign-in and approval', () => {
  it('walks an agent from sign-up to a working account', async () => {
    const { call, staffLogin, adminToken } = await start()

    const signup = await call('POST', '/auth/staff/signup', {
      body: { name: 'Yaw Mensah', phone: '0244000111', association: 'ashaiman-ufa', password: 'long-enough-pw' },
    })
    expect(signup).toMatchObject({ status: 201, body: { status: 'pending_verification' } })
    expect((await staffLogin('0244000111', 'long-enough-pw')).body.error).toBe('pending_verification')

    const verified = await call('POST', '/auth/staff/verify-phone', { body: { phone: '0244000111', code: signup.body.testCode } })
    expect(verified.body).toEqual({ status: 'pending' })
    expect(await staffLogin('0244000111', 'long-enough-pw')).toMatchObject({ status: 403, body: { error: 'pending_approval' } })

    const admin = await adminToken()
    const approved = await call('POST', `/admin/agents/${signup.body.id}/approve`, { token: admin, body: {} })
    expect(approved.body).toMatchObject({ status: 'approved', loginId: 'AG-0002' })

    const login = await staffLogin('AG-0002', 'long-enough-pw')
    expect(login).toMatchObject({ status: 200, body: { user: { role: 'agent', assoc: 'ashaiman-ufa' } } })
  })

  it('refuses wrong passwords and shows the seeded pending agent as waiting', async () => {
    const { staffLogin } = await start()
    expect((await staffLogin('AG-0001', 'nope-nope-nope')).status).toBe(401)
    const pending = await staffLogin(DEMO_ACCOUNTS.pendingAgent.phone, DEMO_ACCOUNTS.pendingAgent.password)
    expect(pending).toMatchObject({ status: 403, body: { error: 'pending_approval' } })
  })

  it('lets only an admin approve, and coordinators see only their association', async () => {
    const { call, staffLogin } = await start()
    const coordinator = (await staffLogin(DEMO_ACCOUNTS.coordinator.loginId, DEMO_ACCOUNTS.coordinator.password)).body.token
    const approve = await call('POST', '/admin/agents/U-pending/approve', { token: coordinator, body: {} })
    expect(approve.status).toBe(403)

    const list = await call('GET', '/admin/agents', { token: coordinator })
    expect(list.body.items.every((agent) => agent.assoc === 'ashaiman-ufa')).toBe(true)
  })

  it('applies a suspension the next time the phone refreshes its token', async () => {
    const { call, adminToken, agentToken } = await start()
    const token = await agentToken()
    expect((await call('POST', '/auth/refresh', { token })).status).toBe(200)

    await call('POST', '/admin/agents/U-agent/suspend', { token: await adminToken(), body: { reason: 'test' } })
    const refresh = await call('POST', '/auth/refresh', { token })
    expect(refresh).toMatchObject({ status: 403, body: { error: 'suspended' } })
  })

  it('refreshes a token that expired recently but not one that expired long ago', async () => {
    const { call } = await start()
    const user = { id: 'U-agent', role: 'agent', name: 'Efua Agent', assoc: 'ashaiman-ufa' }
    const day = 24 * 3600
    expect((await call('POST', '/auth/refresh', { token: await signToken(user, -10 * day) })).status).toBe(200)
    expect((await call('POST', '/auth/refresh', { token: await signToken(user, -40 * day) })).status).toBe(401)
  })

  it('records admin actions in the audit log', async () => {
    const { call, adminToken } = await start()
    const token = await adminToken()
    await call('POST', '/admin/agents/U-pending/approve', { token, body: {} })
    const audit = await call('GET', '/admin/audit', { token })
    expect(audit.body.items[0]).toMatchObject({ action: 'agent.approve', targetId: 'U-pending' })
  })
})

describe('admin farmers list', () => {
  it('shows an admin every farmer and says who registered them', async () => {
    const { call, adminToken, agentToken } = await start()
    await call('POST', '/farmers', { token: await agentToken(), body: registration() })
    const list = await call('GET', '/admin/farmers', { token: await adminToken() })
    expect(list.body).toMatchObject({ total: 1, items: [{ name: 'Ama', registeredByName: 'Efua Agent' }] })
  })

  it('keeps agents out', async () => {
    const { call, agentToken } = await start()
    expect((await call('GET', '/admin/farmers', { token: await agentToken() })).status).toBe(403)
  })
})

describe('farmer registration endpoints', () => {
  it('needs a token, and only agents and coordinators may register farmers', async () => {
    const { call, farmerToken } = await start()
    expect((await call('POST', '/farmers', { body: registration() })).status).toBe(401)
    const forbidden = await call('POST', '/farmers', { token: await farmerToken('0200000555'), body: registration() })
    expect(forbidden.status).toBe(403)
  })

  it('takes the registerer from the token, and treats a repeat as the same farmer', async () => {
    const { call, agentToken } = await start()
    const token = await agentToken()
    const first = await call('POST', '/farmers', { token, body: registration({ registeredBy: 'someone-else' }) })
    expect(first.status).toBe(201)
    expect((await call('GET', `/farmers/${first.body.id}`, { token })).body.registeredBy).toBe('U-agent')
    expect(await call('POST', '/farmers', { token, body: registration() })).toMatchObject({ status: 200, body: first.body })
  })

  it('catches duplicate phone numbers written differently', async () => {
    const { call, agentToken } = await start()
    const token = await agentToken()
    await call('POST', '/farmers', { token, body: registration() })
    const duplicate = await call('POST', '/farmers', { token, body: registration({ clientId: 'c-2', phone: '+233 24 123 4567' }) })
    expect(duplicate).toMatchObject({ status: 409, body: { error: 'duplicate_phone' } })
  })

  it('links a farmer account to the record an agent created, by phone', async () => {
    const { call, agentToken, farmerToken } = await start()
    const farmer = await farmerToken('0241234567')
    expect((await call('GET', '/farmers/me', { token: farmer })).status).toBe(404)

    await call('POST', '/farmers', { token: await agentToken(), body: registration() })
    expect((await call('GET', '/farmers/me', { token: farmer })).body).toMatchObject({ name: 'Ama' })
  })

  it('accepts a photo and refuses one that is too large', async () => {
    const { base, call, agentToken } = await start()
    const token = await agentToken()
    const { body } = await call('POST', '/farmers', { token, body: registration() })

    const upload = (bytes) =>
      fetch(`${base}/farmers/${body.id}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}` },
        body: new Uint8Array(bytes),
      })
    expect((await upload(5_000)).status).toBe(200)
    expect((await upload(600 * 1024)).status).toBe(413)
  })
})
