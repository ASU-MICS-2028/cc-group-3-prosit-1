// What the real API does beyond the mock: Postgres constraints and audit, CORS, error shapes, SMS when
// test mode is off, S3 photo keys, and the votex365 checkout with its signed webhook.
import { createHmac } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { votexProvider } from '../src/integrations.ts'
import { migrate } from '../src/migrate.ts'
import { createApp, DEMO_ACCOUNTS, pgliteDb, signToken, uid } from './harness.ts'

const servers = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

const realFetch = globalThis.fetch

async function start(options) {
  const server = await createApp(options)
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const base = `http://localhost:${server.address().port}`
  const call = async (method, path, { token, body, headers = {}, raw } = {}) => {
    const response = await realFetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
    const text = await response.text()
    const json = response.headers.get('content-type')?.includes('json')
    return { status: response.status, headers: response.headers, body: json && text ? JSON.parse(text) : text }
  }
  const staff = async (account) => (await call('POST', '/auth/staff/login', { body: { identifier: account.loginId, password: account.password } })).body.token
  const farmerToken = async (phone) => {
    const started = await call('POST', '/auth/farmer/start', { body: { phone } })
    return (await call('POST', '/auth/farmer/verify-otp', { body: { phone, code: started.body.testCode, pin: '1234' } })).body.token
  }
  return { server, db: server.ctx.db, call, staff, farmerToken, agent: () => staff(DEMO_ACCOUNTS.agent), admin: () => staff(DEMO_ACCOUNTS.admin) }
}

const registration = (overrides = {}) => ({
  clientId: uid('f-1'),
  name: 'Ama Mensah',
  countryCode: '+233',
  phoneNational: '241234567',
  preferredLanguage: 'tw',
  gender: 'female',
  community: 'Ashaiman',
  region: 'Greater Accra',
  farmSizeAcres: 2.5,
  crops: ['maize', 'tomato'],
  gps: { lat: 5.6941, lng: -0.0332, accuracy: 8, capturedAt: '2026-10-07T08:59:00Z' },
  consent: true,
  registeredAt: '2026-10-07T09:00:00Z',
  ...overrides,
})

describe('schema and migrations', () => {
  it('applies each migration once, even when run again', async () => {
    const db = pgliteDb(new PGlite())
    const files = readdirSync(new URL('../migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort()
    expect(files[0]).toBe('001_initial.sql')
    expect(await migrate(db)).toEqual(files)
    expect(await migrate(db)).toEqual([])
    await db.close()
  })

  it('has the indexes the list endpoints rely on', async () => {
    const db = pgliteDb(new PGlite())
    await migrate(db)
    const { rows } = await db.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
    const names = rows.map((row) => row.indexname)
    for (const index of [
      'audit_log_target_idx',
      'audit_log_changed_at_idx',
      'farmers_registered_at_idx',
      'feedback_created_at_idx',
      'crop_checks_farmer_user_idx',
      'crop_checks_status_idx',
      'loan_requests_farmer_idx',
      'listings_status_crop_idx',
    ]) {
      expect(names).toContain(index)
    }
    await db.close()
  })

  it('makes the user references RESTRICT, so history cannot be orphaned', async () => {
    const db = pgliteDb(new PGlite())
    await migrate(db)
    const { rows } = await db.query("SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('farmers_created_by_fkey', 'payments_farmer_user_id_fkey')")
    const modes = Object.fromEntries(rows.map((row) => [row.conname, row.confdeltype]))
    expect(modes.farmers_created_by_fkey).toBe('r')
    expect(modes.payments_farmer_user_id_fkey).toBe('r')
    await db.close()
  })
})

describe('farmer records in Postgres', () => {
  it('stores every field as the data contract says, converting acres to hectares', async () => {
    const t = await start()
    const { status, body } = await t.call('POST', '/farmers', { token: await t.agent(), body: registration() })
    expect(status).toBe(201)

    const { rows: [row] } = await t.db.query('SELECT * FROM farmers WHERE id = $1', [body.id])
    expect(row).toMatchObject({ phone_e164: '+233241234567', language: 'tw', gender: 'female', farm_size_unit: 'acres', created_by: 'U-agent', consent: true })
    expect(Number(row.farm_size_hectares)).toBeCloseTo(2.5 * 0.404686, 4)
    expect(new Date(row.consent_at).toISOString()).toBe('2026-10-07T09:00:00.000Z')
    const { rows: crops } = await t.db.query('SELECT crop_type FROM farmer_crops WHERE farmer_id = $1 ORDER BY crop_type', [body.id])
    expect(crops.map((c) => c.crop_type)).toEqual(['maize', 'tomato'])

    const { body: record } = await t.call('GET', `/farmers/${body.id}`, { token: await t.admin() })
    expect(record).toMatchObject({ id: body.id, phoneE164: '+233241234567', crops: ['maize', 'tomato'], farmSizeAcres: 2.5, registeredBy: 'U-agent', hasPhoto: false })
  })

  it('answers 400, never 500, for values outside the allowed lists', async () => {
    const t = await start()
    const token = await t.agent()
    for (const overrides of [{ gender: 'other' }, { preferredLanguage: 'fr' }, { crops: ['rice'] }, { gps: { lat: 200, lng: 0, accuracy: 5, capturedAt: '2026-10-07T09:00:00Z' } }]) {
      const { status, body } = await t.call('POST', '/farmers', { token, body: registration({ clientId: uid(JSON.stringify(overrides)), ...overrides }) })
      expect({ status, error: body.error }).toEqual({ status: 400, error: 'invalid_request' })
    }
  })

  it('requires the clientId to be a UUID', async () => {
    const t = await start()
    const { status, body } = await t.call('POST', '/farmers', { token: await t.agent(), body: registration({ clientId: 'c-1' }) })
    expect(status).toBe(400)
    expect(body).toMatchObject({ error: 'invalid_request', field: 'clientId' })
  })

  it('treats two sends of the same registration at once as one farmer', async () => {
    const t = await start()
    const token = await t.agent()
    const [a, b] = await Promise.all([1, 2].map(() => t.call('POST', '/farmers', { token, body: registration() })))
    expect([a.status, b.status].sort()).toEqual([200, 201])
    expect(a.body.id).toBe(b.body.id)
  })

  it('keeps the photo in storage under the farmer\'s key', async () => {
    const t = await start()
    const token = await t.agent()
    const { body } = await t.call('POST', '/farmers', { token, body: registration() })
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const sent = await t.call('POST', `/farmers/${body.id}/photo`, { token, raw: jpeg, headers: { 'Content-Type': 'image/jpeg' } })
    expect(sent).toMatchObject({ status: 200, body: { bytes: jpeg.length } })
    expect(await t.server.ctx.storage.get(`farmers/${body.id}/photo.jpg`)).toEqual(jpeg)
    const tooBig = await t.call('POST', `/farmers/${body.id}/photo`, { token, raw: Buffer.alloc(600 * 1024), headers: { 'Content-Type': 'image/jpeg' } })
    expect(tooBig).toMatchObject({ status: 413, body: { error: 'too_large' } })
  })

  it('lets a signed-in farmer see the record an agent made for them', async () => {
    const t = await start()
    await t.call('POST', '/farmers', { token: await t.agent(), body: registration() })
    const { status, body } = await t.call('GET', '/farmers/me', { token: await t.farmerToken('+233241234567') })
    expect(status).toBe(200)
    expect(body).toMatchObject({ name: 'Ama Mensah', community: 'Ashaiman', crops: ['maize', 'tomato'] })
  })
})

describe('audit log', () => {
  it('records who registered a farmer, from the token', async () => {
    const t = await start()
    const { body } = await t.call('POST', '/farmers', { token: await t.agent(), body: registration() })
    const { rows: [entry] } = await t.db.query("SELECT * FROM audit_log WHERE table_name = 'farmers' ORDER BY id DESC LIMIT 1")
    expect(entry).toMatchObject({ record_id: body.id, action: 'INSERT', event: 'farmers.insert', app_actor: 'U-agent', actor_role: 'agent' })
  })

  it('never stores a PIN or password hash, and ignores failed-login bookkeeping', async () => {
    const t = await start()
    const before = (await t.db.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n
    await t.call('POST', '/auth/staff/login', { body: { identifier: DEMO_ACCOUNTS.agent.loginId, password: 'wrong-password' } })
    expect((await t.db.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n).toBe(before)

    await t.farmerToken('+233241230000')
    const { rows } = await t.db.query("SELECT * FROM audit_log WHERE new_data ? 'pin_hash' OR new_data ? 'password_hash' OR old_data ? 'pin_hash' OR old_data ? 'password_hash'")
    expect(rows).toEqual([])
  })

  it('records CSV exports', async () => {
    const t = await start()
    const admin = await t.admin()
    await t.call('GET', '/admin/export/farmers.csv', { token: admin })
    const [latest] = (await t.call('GET', '/admin/audit', { token: admin })).body.items
    expect(latest).toMatchObject({ action: 'export.farmers', actorId: 'ADM-001', detail: '0 rows' })
  })

  it('records feedback, with the sender as the actor', async () => {
    const t = await start()
    const token = await t.farmerToken('+233241234567')
    await t.call('POST', '/feedback', { token, body: { clientId: uid('fb-audit'), screen: 'wallet', message: 'Nice app', rating: 5, appLanguage: 'en' } })
    const { rows: [entry] } = await t.db.query("SELECT * FROM audit_log WHERE table_name = 'feedback' ORDER BY id DESC LIMIT 1")
    expect(entry).toMatchObject({ action: 'INSERT', event: 'feedback.insert', actor_role: 'farmer' })
    expect(entry.app_actor).toBeTruthy()
  })
})

describe('HTTP behaviour', () => {
  it('allows the PWA origin with the Authorization header, and nobody else', async () => {
    const t = await start()
    const preflight = await t.call('OPTIONS', '/farmers', { headers: { Origin: 'https://app.example', 'Access-Control-Request-Headers': 'authorization' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
    const stranger = await t.call('GET', '/health', { headers: { Origin: 'https://evil.example' } })
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers every error with { error, message }', async () => {
    const t = await start()
    expect(await t.call('GET', '/nowhere')).toMatchObject({ status: 404, body: { error: 'not_found', message: 'Not found' } })
    expect(await t.call('POST', '/auth/farmer/start', { raw: '{not json' })).toMatchObject({ status: 400, body: { error: 'invalid_json' } })
    expect(await t.call('POST', '/farmers', { body: registration() })).toMatchObject({ status: 401, body: { error: 'unauthorized' } })
  })
})

describe('sign-in codes with test mode off', () => {
  it('texts the code and never returns it', async () => {
    const t = await start({ testMode: false })
    const started = await t.call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    expect(started.body).toEqual({ next: 'otp', expiresInSeconds: 300 })
    const [sms] = t.server.sms.sent
    expect(sms.to).toBe('+233241234567')
    const code = sms.message.match(/\d{6}/)[0]
    const verified = await t.call('POST', '/auth/farmer/verify-otp', { body: { phone: '+233241234567', code, pin: '4821' } })
    expect(verified.status).toBe(200)
  })

  it('does not spend a code or a rate-limit slot when the SMS cannot be sent', async () => {
    const t = await start({ testMode: false })
    t.server.ctx.sms.send = async () => {
      throw Object.assign(new Error('down'), { status: 503, code: 'sms_unavailable' })
    }
    for (let i = 0; i < 4; i++) await t.call('POST', '/auth/farmer/start', { body: { phone: '+233241234567' } })
    const { rows } = await t.db.query('SELECT * FROM otp_codes')
    expect(rows).toEqual([])
  })
})

describe('votex365 payments', () => {
  const SECRET = { api_key: 'vxp_test_key', webhook_secret: 'whsec_test' }
  const config = { votexBaseUrl: 'https://votex.test/api', paymentReturnUrl: 'https://app.example/' }

  function fakeVotex() {
    const created = []
    vi.stubGlobal('fetch', async (url, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body)
        created.push({ url, body, auth: init.headers.Authorization })
        return Response.json({ id: `vx_${created.length}`, reference: body.reference, status: 'pending', checkout_url: `https://pay.votex.test/${created.length}` }, { status: 201 })
      }
      return Response.json({ id: 'vx_1', status: 'paid' })
    })
    return { created, provider: votexProvider(config, async () => SECRET) }
  }

  const sign = (body, timestamp = Math.floor(Date.now() / 1000)) => ({
    'X-Votex-Webhook-Timestamp': String(timestamp),
    'X-Votex-Webhook-Signature': createHmac('sha256', SECRET.webhook_secret).update(`${timestamp}.${body}`).digest('hex'),
  })

  const payment = (overrides = {}) => ({ clientId: uid('p-1'), direction: 'collect', amount: 50, currency: 'GHS', network: 'mtn', phone: '+233241234567', ...overrides })

  it('opens a checkout for a cedi collection, once, with our clientId as the reference', async () => {
    const votex = fakeVotex()
    const t = await start({ checkout: votex.provider })
    const token = await t.farmerToken('+233241234567')
    const first = await t.call('POST', '/payments', { token, body: payment() })
    expect(first).toMatchObject({ status: 201, body: { status: 'pending', checkoutUrl: 'https://pay.votex.test/1' } })
    expect(votex.created[0]).toMatchObject({ url: 'https://votex.test/api/payments', auth: 'Bearer vxp_test_key', body: { reference: uid('p-1'), amount: 50, return_url: 'https://app.example/' } })

    const retry = await t.call('POST', '/payments', { token, body: payment() })
    expect(retry).toMatchObject({ status: 200, body: { id: first.body.id, checkoutUrl: 'https://pay.votex.test/1' } })
    expect(votex.created).toHaveLength(1)
  })

  it('simulates what votex365 cannot do: payouts and other currencies', async () => {
    const votex = fakeVotex()
    const t = await start({ checkout: votex.provider })
    const token = await t.farmerToken('+233241234567')
    await t.call('POST', '/payments', { token, body: payment({ clientId: uid('out'), direction: 'payout' }) })
    await t.call('POST', '/payments', { token, body: payment({ clientId: uid('kes'), currency: 'KES', network: 'mpesa', phone: '+254712345678' }) })
    expect(votex.created).toHaveLength(0)
  })

  it('marks the payment from a correctly signed webhook, and refuses a forged one', async () => {
    const votex = fakeVotex()
    const t = await start({ checkout: votex.provider })
    const token = await t.farmerToken('+233241234567')
    const { body: created } = await t.call('POST', '/payments', { token, body: payment() })

    const event = JSON.stringify({ id: 'evt_1', event: 'payment.succeeded', livemode: false, data: { id: 'vx_1', reference: uid('p-1'), status: 'paid' } })
    const forged = await t.call('POST', '/webhooks/votex365', { raw: event, headers: { ...sign(event), 'X-Votex-Webhook-Signature': 'ab'.repeat(32) } })
    expect(forged.status).toBe(401)
    const stale = await t.call('POST', '/webhooks/votex365', { raw: event, headers: sign(event, Math.floor(Date.now() / 1000) - 600) })
    expect(stale.status).toBe(401)
    expect((await t.call('GET', `/payments/${created.id}`, { token })).body.status).toBe('pending')

    const genuine = await t.call('POST', '/webhooks/votex365', { raw: event, headers: sign(event) })
    expect(genuine.status).toBe(200)
    const { body: wallet } = await t.call('GET', '/payments/me', { token })
    expect(wallet.items[0]).toMatchObject({ id: created.id, status: 'successful', checkoutUrl: null })
    expect(wallet.balance).toEqual([{ currency: 'GHS', received: 0, paid: 50, amount: -50 }])
  })

  it('acknowledges a genuine event it has no use for, so votex365 stops retrying', async () => {
    const votex = fakeVotex()
    const t = await start({ checkout: votex.provider })
    const event = JSON.stringify({ id: 'evt_2', event: 'payout.created', data: { id: 'po_1' } })
    expect((await t.call('POST', '/webhooks/votex365', { raw: event, headers: sign(event) })).status).toBe(200)
  })

  it('answers 503 and keeps the payment when votex365 is down, so the phone retries', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const t = await start({ checkout: votexProvider(config, async () => SECRET) })
    const token = await t.farmerToken('+233241234567')
    const failed = await t.call('POST', '/payments', { token, body: payment() })
    expect(failed).toMatchObject({ status: 503, body: { error: 'payments_unavailable' } })
    const { rows } = await t.db.query('SELECT status, checkout_url FROM payments')
    expect(rows).toEqual([{ status: 'pending', checkout_url: null }])
  })
})

describe('token refresh and account status', () => {
  it('stops a suspended farmer from refreshing, like a suspended agent', async () => {
    const t = await start()
    const token = await t.farmerToken('+233241234567')
    expect((await t.call('POST', '/auth/refresh', { token })).status).toBe(200)

    await t.db.query("UPDATE users SET status = 'suspended' WHERE role = 'farmer' AND phone_e164 = $1", ['+233241234567'])
    expect(await t.call('POST', '/auth/refresh', { token })).toMatchObject({ status: 403, body: { error: 'suspended' } })
  })
})

describe('admin farmer detail', () => {
  it('returns the record and payments to an admin and the association coordinator, and 404 elsewhere', async () => {
    const t = await start()
    const id = (await t.call('POST', '/farmers', { token: await t.agent(), body: registration() })).body.id

    expect(await t.call('GET', `/admin/farmers/${id}`, { token: await t.admin() })).toMatchObject({
      status: 200,
      body: { id, name: 'Ama Mensah', payments: [], balance: [] },
    })
    expect((await t.call('GET', `/admin/farmers/${id}`, { token: await t.staff(DEMO_ACCOUNTS.coordinator) })).status).toBe(200)

    await t.db.query("INSERT INTO users (id, role, name, phone_e164, association_id, status) VALUES ('U-ngfn-co', 'coordinator', 'Ngfn Co', '+233200000124', 'ngfn', 'approved')")
    const other = await signToken({ id: 'U-ngfn-co', role: 'coordinator', name: 'Ngfn Co', phone: '+233200000124', assoc: 'ngfn' })
    expect((await t.call('GET', `/admin/farmers/${id}`, { token: other })).status).toBe(404)
  })
})

describe('editing a farmer', () => {
  it('updates the editable fields and audits the change', async () => {
    const t = await start()
    const token = await t.agent()
    const { body } = await t.call('POST', '/farmers', { token, body: registration() })

    const patched = await t.call('PATCH', `/farmers/${body.id}`, {
      token,
      body: { name: 'Ama Mensah', community: 'Ashaiman', crops: ['maize'], gender: 'female', profile: { soilType: 'loamy' } },
    })
    expect(patched).toMatchObject({
      status: 200,
      body: { name: 'Ama Mensah', community: 'Ashaiman', crops: ['maize'], gender: 'female', profile: { soilType: 'loamy' } },
    })

    const audit = await t.call('GET', '/admin/audit', { token: await t.admin() })
    expect(audit.body.items.find((item) => item.action === 'farmers.update')).toMatchObject({ targetId: body.id })
  })

  it('refuses a phone or clientId change, and a bad enum', async () => {
    const t = await start()
    const token = await t.agent()
    const { body } = await t.call('POST', '/farmers', { token, body: registration() })
    expect(await t.call('PATCH', `/farmers/${body.id}`, { token, body: { phoneNational: '200000000' } })).toMatchObject({ status: 400, body: { field: 'phone' } })
    expect(await t.call('PATCH', `/farmers/${body.id}`, { token, body: { clientId: 'x' } })).toMatchObject({ status: 400, body: { field: 'clientId' } })
    expect(await t.call('PATCH', `/farmers/${body.id}`, { token, body: { gender: 'other' } })).toMatchObject({ status: 400, body: { field: 'gender' } })
  })

  it('replaces the crop list', async () => {
    const t = await start()
    const token = await t.agent()
    const { body } = await t.call('POST', '/farmers', { token, body: registration({ crops: ['maize', 'tomato'] }) })
    expect((await t.call('PATCH', `/farmers/${body.id}`, { token, body: { crops: ['yam'] } })).body.crops).toEqual(['yam'])
  })

  it('hides a farmer from an agent in another association', async () => {
    const t = await start()
    const { body } = await t.call('POST', '/farmers', { token: await t.agent(), body: registration() })
    await t.db.query("INSERT INTO users (id, role, name, phone_e164, association_id, status) VALUES ('U-other', 'agent', 'Other', '+233200000125', 'ngfn', 'approved')")
    const outsider = await signToken({ id: 'U-other', role: 'agent', name: 'Other', phone: '+233200000125', assoc: 'ngfn' })
    expect((await t.call('PATCH', `/farmers/${body.id}`, { token: outsider, body: { name: 'X' } })).status).toBe(404)
  })
})

describe('sessions and credentials', () => {
  it('ends every session when the phone logs out', async () => {
    const t = await start()
    const token = await t.agent()
    expect((await t.call('GET', '/auth/me', { token })).status).toBe(200)

    expect((await t.call('POST', '/auth/logout', { token })).status).toBe(204)
    expect(await t.call('GET', '/auth/me', { token })).toMatchObject({ status: 401, body: { error: 'token_revoked' } })
    expect((await t.call('POST', '/auth/refresh', { token })).status).toBe(401)
  })

  it('cuts off a suspended account on its next request, not just the refresh', async () => {
    const t = await start()
    const token = await t.agent()
    await t.call('POST', '/admin/agents/U-agent/suspend', { token: await t.admin(), body: { reason: 'test' } })
    expect(await t.call('GET', '/auth/me', { token })).toMatchObject({ status: 403, body: { error: 'suspended' } })
  })

  it('changes a staff password, keeping the current device signed in', async () => {
    const t = await start()
    const token = await t.staff(DEMO_ACCOUNTS.agent)

    expect(await t.call('POST', '/auth/staff/password', { token, body: { currentPassword: 'nope', newPassword: 'brand-new-pw' } })).toMatchObject({
      status: 401,
      body: { error: 'wrong_password' },
    })
    expect(await t.call('POST', '/auth/staff/password', { token, body: { currentPassword: DEMO_ACCOUNTS.agent.password, newPassword: 'short' } })).toMatchObject({
      status: 400,
      body: { field: 'newPassword' },
    })

    const changed = await t.call('POST', '/auth/staff/password', { token, body: { currentPassword: DEMO_ACCOUNTS.agent.password, newPassword: 'brand-new-pw' } })
    expect(changed.status).toBe(200)
    expect((await t.call('GET', '/auth/me', { token })).status).toBe(401) // the old token is gone
    expect((await t.call('GET', '/auth/me', { token: changed.body.token })).status).toBe(200) // the fresh one works
    expect((await t.call('POST', '/auth/staff/login', { body: { identifier: DEMO_ACCOUNTS.agent.loginId, password: 'brand-new-pw' } })).status).toBe(200)
  })

  it('changes a farmer PIN', async () => {
    const t = await start()
    const token = await t.farmerToken('+233241234567')

    expect(await t.call('POST', '/auth/farmer/pin', { token, body: { pin: '0000', newPin: '4321' } })).toMatchObject({ status: 401, body: { error: 'wrong_pin' } })
    expect(await t.call('POST', '/auth/farmer/pin', { token, body: { pin: '1234', newPin: '12' } })).toMatchObject({ status: 422, body: { error: 'invalid_pin' } })

    const changed = await t.call('POST', '/auth/farmer/pin', { token, body: { pin: '1234', newPin: '4321' } })
    expect(changed.status).toBe(200)
    expect((await t.call('GET', '/auth/me', { token })).status).toBe(401)
    expect((await t.call('POST', '/auth/farmer/login', { body: { phone: '+233241234567', pin: '4321' } })).status).toBe(200)
  })
})
