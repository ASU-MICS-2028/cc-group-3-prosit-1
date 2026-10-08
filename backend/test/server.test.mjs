// Ported from frontend/agroconnect-pwa/mock-server: the same contract tests, run against the real API.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, DEMO_ACCOUNTS, signToken, uid } from './harness.ts'

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

const registration = (overrides = {}) => ({
  clientId: uid('c-1'),
  name: 'Ama',
  countryCode: '+233',
  phoneNational: '241234567',
  ...overrides,
})

describe('phone format', () => {
  it('refuses a local-format phone in sign-in and sign-up calls', async () => {
    const { call } = await start()
    const farmer = await call('POST', '/auth/farmer/start', { body: { phone: '0241234567' } })
    expect(farmer).toMatchObject({ status: 400, body: { error: 'invalid_request', field: 'phone' } })
    const staff = await call('POST', '/auth/staff/signup', {
      body: { name: 'Yaw', phone: '024 400 0111', association: 'ashaiman-ufa', password: 'long-enough-pw' },
    })
    expect(staff.status).toBe(400)
  })

  it('puts the phone in the token, so GET /farmers/me can use it', async () => {
    const { call, farmerToken } = await start()
    const { body } = await call('GET', '/auth/me', { token: await farmerToken('+233241234567') })
    expect(body.phone).toBe('+233241234567')
  })
})

describe('demo accounts', () => {
  it('has a farmer who can sign in with a PIN straight away', async () => {
    const { call } = await start()
    const { phone, pin } = DEMO_ACCOUNTS.farmer
    expect((await call('POST', '/auth/farmer/start', { body: { phone } })).body).toEqual({ next: 'pin' })
    const login = await call('POST', '/auth/farmer/login', { body: { phone, pin } })
    expect(login).toMatchObject({ status: 200, body: { user: { role: 'farmer', name: 'Akosua Farmer' } } })
  })
})

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
    const started = await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    expect(started.body).toMatchObject({ next: 'otp', expiresInSeconds: 300 })

    const verified = await call('POST', '/auth/farmer/verify-otp', {
      body: { phone: '+233241234567', code: started.body.testCode, pin: '4821' },
    })
    expect(verified.status).toBe(200)
    expect(verified.body.user).toMatchObject({ role: 'farmer', phone: '+233241234567' })

    expect((await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })).body).toEqual({ next: 'pin' })
    const login = await call('POST', '/auth/farmer/login', { body: { phone: '+233241234567', pin: '4821' } })
    expect(login.status).toBe(200)
  })

  it('returns no code when test mode is off', async () => {
    const { call } = await start({ testMode: false })
    const started = await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    expect(started.body).not.toHaveProperty('testCode')
  })

  it('counts wrong codes, and rejects a PIN that is not 4 digits', async () => {
    const { call } = await start()
    await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    const wrong = await call('POST', '/auth/farmer/verify-otp', { body: { phone: '+233241234567', code: '000000', pin: '1234' } })
    expect(wrong).toMatchObject({ status: 400, body: { error: 'invalid_code', attemptsLeft: 4 } })
    const badPin = await call('POST', '/auth/farmer/verify-otp', { body: { phone: '+233241234567', code: '000000', pin: '12' } })
    expect(badPin).toMatchObject({ status: 422, body: { error: 'invalid_pin' } })
  })

  it('rejects an expired code', async () => {
    const clock = { time: 1_000_000 }
    const { call } = await start({ now: () => clock.time })
    const started = await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    clock.time += 6 * 60_000
    const verified = await call('POST', '/auth/farmer/verify-otp', {
      body: { phone: '+233241234567', code: started.body.testCode, pin: '1234' },
    })
    expect(verified).toMatchObject({ status: 410, body: { error: 'code_expired' } })
  })

  it('limits code requests', async () => {
    const { call } = await start()
    for (let i = 0; i < 3; i++) await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    const fourth = await call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    expect(fourth).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
  })

  it('locks the account after five wrong PINs', async () => {
    const { call, farmerToken } = await start()
    await farmerToken('+233241234567', '4821')
    const results = []
    for (let i = 0; i < 6; i++) {
      results.push(await call('POST', '/auth/farmer/login', { body: { phone: '+233241234567', pin: '0000' } }))
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
      body: { name: 'Yaw Mensah', phone: '+233244000111', association: 'ashaiman-ufa', password: 'long-enough-pw' },
    })
    expect(signup).toMatchObject({ status: 201, body: { status: 'pending_verification' } })
    expect((await staffLogin('+233244000111', 'long-enough-pw')).body.error).toBe('pending_verification')

    const verified = await call('POST', '/auth/staff/verify-phone', { body: { phone: '+233244000111', code: signup.body.testCode } })
    expect(verified.body).toEqual({ status: 'pending' })
    expect(await staffLogin('+233244000111', 'long-enough-pw')).toMatchObject({ status: 403, body: { error: 'pending_approval' } })

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
    const forbidden = await call('POST', '/farmers', { token: await farmerToken('+233200000555'), body: registration() })
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

  it('catches a second farmer with the same phone number', async () => {
    const { call, agentToken } = await start()
    const token = await agentToken()
    await call('POST', '/farmers', { token, body: registration() })
    const duplicate = await call('POST', '/farmers', { token, body: registration({ clientId: uid('c-2') }) })
    expect(duplicate).toMatchObject({ status: 409, body: { error: 'duplicate_phone' } })
  })

  it('refuses a phone with a leading zero or a missing country code', async () => {
    const { call, agentToken } = await start()
    const token = await agentToken()
    const leadingZero = await call('POST', '/farmers', { token, body: registration({ phoneNational: '0241234567' }) })
    expect(leadingZero).toMatchObject({ status: 400, body: { error: 'invalid_request' } })
    const noCode = await call('POST', '/farmers', { token, body: registration({ countryCode: undefined }) })
    expect(noCode.status).toBe(400)
  })

  it('refuses a gender or language outside the allowed list, with the field', async () => {
    const { call, agentToken } = await start()
    const token = await agentToken()
    const gender = await call('POST', '/farmers', { token, body: registration({ gender: 'other' }) })
    expect(gender).toMatchObject({ status: 400, body: { error: 'invalid_request', field: 'gender' } })
    const language = await call('POST', '/farmers', { token, body: registration({ preferredLanguage: 'fr' }) })
    expect(language).toMatchObject({ status: 400, body: { error: 'invalid_request', field: 'preferredLanguage' } })
    const ok = await call('POST', '/farmers', { token, body: registration({ clientId: uid('c-enum'), gender: 'undisclosed', preferredLanguage: 'dag' }) })
    expect(ok.status).toBe(201)
  })

  it('links a farmer account to the record an agent created, by phone', async () => {
    const { call, agentToken, farmerToken } = await start()
    const farmer = await farmerToken('+233241234567')
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

describe('dashboard stats', () => {
  async function northernAgentToken({ call, adminToken, staffLogin }) {
    const signup = await call('POST', '/auth/staff/signup', {
      body: { name: 'Ibrahim N.', phone: '+233244999000', association: 'ngfn', password: 'long-enough-pw' },
    })
    await call('POST', '/auth/staff/verify-phone', { body: { phone: '+233244999000', code: signup.body.testCode } })
    const approved = await call('POST', `/admin/agents/${signup.body.id}/approve`, { token: await adminToken(), body: {} })
    return (await staffLogin(approved.body.loginId, 'long-enough-pw')).body.token
  }

  async function seed(t) {
    const home = await t.agentToken()
    const north = await northernAgentToken(t)
    const post = (token, overrides) =>
      t.call('POST', '/farmers', {
        token,
        body: registration({
          registeredAt: '2026-10-05T10:00:00Z',
          community: 'Ashaiman',
          preferredLanguage: 'tw',
          gender: 'female',
          crops: ['maize', 'tomato'],
          ...overrides,
        }),
      })
    await post(home, { clientId: uid('a'), phoneNational: '241111111' })
    await post(home, { clientId: uid('b'), phoneNational: '242222222', gender: null, crops: ['maize'], registeredAt: '2026-10-06T23:30:00Z' })
    await post(north, { clientId: uid('c'), phoneNational: '243333333', community: 'Tamale', preferredLanguage: 'dag' })
    return { home, north }
  }

  it('counts everything for an admin, and only their association for a coordinator', async () => {
    const t = await start()
    await seed(t)

    const admin = (await t.call('GET', '/admin/stats', { token: await t.adminToken() })).body
    expect(admin.totals).toMatchObject({ farmers: 3, agentsActive: 2 })
    expect(admin.byCrop).toEqual([{ key: 'maize', count: 3 }, { key: 'tomato', count: 2 }])
    expect(admin.byCommunity).toEqual([{ key: 'Ashaiman', count: 2 }, { key: 'Tamale', count: 1 }])
    expect(admin.byGender).toEqual([{ key: 'female', count: 2 }, { key: 'unknown', count: 1 }])

    const coordinatorToken = (await t.staffLogin(DEMO_ACCOUNTS.coordinator.loginId, DEMO_ACCOUNTS.coordinator.password)).body.token
    const coordinator = (await t.call('GET', '/admin/stats', { token: coordinatorToken })).body
    expect(coordinator.totals).toMatchObject({ farmers: 2, agentsActive: 1 })
    expect(coordinator.byCommunity).toEqual([{ key: 'Ashaiman', count: 2 }])
  })

  it('counts days in Ghana time, not UTC', async () => {
    const t = await start()
    await seed(t)
    const { byDay } = (await t.call('GET', '/admin/stats', { token: await t.adminToken() })).body
    // 23:30 UTC is still the same day in Accra (UTC+0), so the two Ashaiman farmers land on separate days.
    expect(byDay).toEqual([{ key: '2026-10-05', count: 2 }, { key: '2026-10-06', count: 1 }])
  })

  it('filters by date and rejects a bad date', async () => {
    const t = await start()
    await seed(t)
    const token = await t.adminToken()
    expect((await t.call('GET', '/admin/stats?from=2026-10-06', { token })).body.totals.farmers).toBe(1)
    expect((await t.call('GET', '/admin/stats?from=yesterday', { token })).status).toBe(400)
  })

  it('keeps agents and farmers out', async () => {
    const t = await start()
    expect((await t.call('GET', '/admin/stats', { token: await t.agentToken() })).status).toBe(403)
    expect((await t.call('GET', '/admin/stats', { token: await t.farmerToken('+233200000777') })).status).toBe(403)
  })

  it('shows what an agent reports in a heartbeat', async () => {
    const t = await start()
    const { home } = await seed(t)
    const heartbeat = { pending: 3, attention: 1, lastSyncAt: '2026-10-07T09:00:00Z', appVersion: '1.0.0' }
    expect((await t.call('POST', '/agents/me/heartbeat', { token: home, body: heartbeat })).status).toBe(204)

    const { sync, byAgent } = (await t.call('GET', '/admin/stats', { token: await t.adminToken() })).body
    // Stored as TIMESTAMPTZ, so it comes back in the normalised ISO form.
    expect(sync).toEqual([{ agentId: 'AG-0001', pending: 3, attention: 1, lastSyncAt: '2026-10-07T09:00:00.000Z' }])
    expect(byAgent.find((agent) => agent.agentId === 'AG-0001').lastSeenAt).toBeTruthy()
  })

  it('rejects a heartbeat with nonsense counts, and one from an admin', async () => {
    const t = await start()
    const bad = await t.call('POST', '/agents/me/heartbeat', { token: await t.agentToken(), body: { pending: -1, attention: 0 } })
    expect(bad.status).toBe(400)
    const forbidden = await t.call('POST', '/agents/me/heartbeat', { token: await t.adminToken(), body: { pending: 0, attention: 0 } })
    expect(forbidden.status).toBe(403)
  })
})

describe('farmer CSV export', () => {
  async function download(t, token, path = '/admin/export/farmers.csv') {
    const response = await fetch(t.base + path, { headers: { Authorization: `Bearer ${token}` } })
    const bytes = new Uint8Array(await response.arrayBuffer())
    // text() would drop a leading BOM, so the raw bytes are kept for checking it.
    return { response, bytes, text: new TextDecoder().decode(bytes) }
  }

  it('starts with a BOM and a header row, and sends a download header', async () => {
    const t = await start()
    const { response, bytes, text } = await download(t, await t.adminToken())
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(text).toContain('clientId,id,name,phoneE164,gender')
  })

  it('converts acres to hectares and keeps negative coordinates intact', async () => {
    const t = await start()
    await t.call('POST', '/farmers', {
      token: await t.agentToken(),
      body: registration({ farmSizeAcres: 2, gps: { lat: -0.123456, lng: 5.5, accuracy: 8 }, crops: ['maize', 'okro'] }),
    })
    const { text } = await download(t, await t.adminToken())
    const row = text.trim().split('\r\n')[1]
    expect(row).toContain(',0.8094,2,acres,maize;okro,-0.123456,5.5,8,')
    expect(row).toContain('+233241234567')
  })

  it('stops spreadsheet formulas in names from running, and quotes commas and quotes', async () => {
    const t = await start()
    const token = await t.agentToken()
    await t.call('POST', '/farmers', { token, body: registration({ name: '=HYPERLINK("http://evil")', community: 'Ashaiman, East' }) })
    const { text } = await download(t, await t.adminToken())
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(text).toContain('"Ashaiman, East"')
  })

  it('exports only a coordinator\'s association, and records the export', async () => {
    const t = await start()
    const token = await t.agentToken()
    await t.call('POST', '/farmers', { token, body: registration() })
    const coordinator = (await t.staffLogin(DEMO_ACCOUNTS.coordinator.loginId, DEMO_ACCOUNTS.coordinator.password)).body.token
    expect((await download(t, coordinator)).text.trim().split('\r\n')).toHaveLength(2)
    expect((await download(t, await t.agentToken())).response.status).toBe(403)

    const audit = await t.call('GET', '/admin/audit', { token: await t.adminToken() })
    expect(audit.body.items[0]).toMatchObject({ action: 'export.farmers', detail: '1 rows' })
  })
})

describe('coordinators', () => {
  const coordinator = (overrides = {}) => ({ name: 'Abena Owusu', phone: '+233244111222', association: 'ngfn', password: 'long-enough-pw', ...overrides })

  it('are created by an admin, and can then sign in as coordinators', async () => {
    const { call, adminToken, staffLogin } = await start()
    const created = await call('POST', '/admin/coordinators', { token: await adminToken(), body: coordinator() })
    expect(created).toMatchObject({ status: 201, body: { role: 'coordinator', status: 'approved', assoc: 'ngfn' } })
    expect(created.body.loginId).toMatch(/^CO-/)

    const login = await staffLogin(created.body.loginId, 'long-enough-pw')
    expect(login).toMatchObject({ status: 200, body: { user: { role: 'coordinator', assoc: 'ngfn' } } })
  })

  it('are listed apart from agents', async () => {
    const { call, adminToken } = await start()
    const token = await adminToken()
    await call('POST', '/admin/coordinators', { token, body: coordinator() })

    const coordinators = (await call('GET', '/admin/coordinators', { token })).body.items
    expect(coordinators.map((c) => c.name)).toEqual(expect.arrayContaining(['Kwame Coordinator', 'Abena Owusu']))
    expect(coordinators.every((c) => c.role === 'coordinator')).toBe(true)

    const agents = (await call('GET', '/admin/agents', { token })).body.items
    expect(agents.every((a) => a.role === 'agent')).toBe(true)
  })

  it('can be suspended and reinstated, and a suspension reaches the phone when it refreshes', async () => {
    const { call, adminToken, staffLogin } = await start()
    const admin = await adminToken()
    const { body } = await call('POST', '/admin/coordinators', { token: admin, body: coordinator() })
    const phoneToken = (await staffLogin(body.loginId, 'long-enough-pw')).body.token

    expect((await call('POST', `/admin/coordinators/${body.id}/suspend`, { token: admin, body: { reason: 'test' } })).body.status).toBe('suspended')
    expect(await call('POST', '/auth/refresh', { token: phoneToken })).toMatchObject({ status: 403, body: { error: 'suspended' } })

    expect((await call('POST', `/admin/coordinators/${body.id}/reinstate`, { token: admin, body: {} })).body.status).toBe('approved')
    expect((await call('POST', '/auth/refresh', { token: phoneToken })).status).toBe(200)
  })

  it('cannot be approved or rejected like agents, and agents cannot be managed through the coordinator routes', async () => {
    const { call, adminToken } = await start()
    const admin = await adminToken()
    expect((await call('POST', '/admin/coordinators/U-coord/approve', { token: admin, body: {} })).status).toBe(404)
    expect((await call('POST', '/admin/coordinators/U-agent/suspend', { token: admin, body: {} })).status).toBe(404)
    expect((await call('POST', '/admin/agents/U-coord/suspend', { token: admin, body: {} })).status).toBe(404)
  })

  it('are recorded in the audit log under their own name', async () => {
    const { call, adminToken } = await start()
    const admin = await adminToken()
    const { body } = await call('POST', '/admin/coordinators', { token: admin, body: coordinator() })
    await call('POST', `/admin/coordinators/${body.id}/suspend`, { token: admin, body: {} })
    // ADMIN-CONTRACT: "A coordinator being created appears as users.insert". Older rows are the seeded accounts.
    const [suspend, create] = (await call('GET', '/admin/audit', { token: admin })).body.items
    expect(suspend).toMatchObject({ action: 'coordinator.suspend', targetId: body.id, actorId: 'ADM-001', actorRole: 'admin' })
    expect(create).toMatchObject({ action: 'users.insert', targetId: body.id, actorId: 'ADM-001' })
  })

  it.each([
    ['name', { name: ' ' }],
    ['phone', { phone: '0244111222' }],
    ['association', { association: 'nowhere' }],
    ['password', { password: 'short' }],
  ])('refuse a bad %s', async (field, overrides) => {
    const { call, adminToken } = await start()
    const result = await call('POST', '/admin/coordinators', { token: await adminToken(), body: coordinator(overrides) })
    expect(result).toMatchObject({ status: 400, body: { error: 'invalid_request', field } })
  })

  it('refuse a phone number that already has a staff account', async () => {
    const { call, adminToken } = await start()
    const result = await call('POST', '/admin/coordinators', { token: await adminToken(), body: coordinator({ phone: '+233200000003' }) })
    expect(result).toMatchObject({ status: 409, body: { error: 'phone_taken' } })
  })

  it('can only be managed by an admin', async () => {
    const { call, staffLogin } = await start()
    const coordinatorToken = (await staffLogin(DEMO_ACCOUNTS.coordinator.loginId, DEMO_ACCOUNTS.coordinator.password)).body.token
    expect((await call('GET', '/admin/coordinators', { token: coordinatorToken })).status).toBe(403)
    expect((await call('POST', '/admin/coordinators', { token: coordinatorToken, body: coordinator() })).status).toBe(403)
  })
})
