import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './server.mjs'
import { DEMO_ACCOUNTS } from './store.mjs'

const servers = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

async function boot() {
  const clock = { time: 1_760_000_000_000 }
  const server = await createApp({ now: () => clock.time, paymentDelayMs: 1000 })
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
    return { status: response.status, body: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text }
  }
  const staff = async (account) => (await call('POST', '/auth/staff/login', { body: { identifier: account.loginId, password: account.password } })).body.token
  const farmerToken = async (phone) => {
    const started = await call('POST', '/auth/farmer/start', { body: { phone } })
    return (await call('POST', '/auth/farmer/verify-otp', { body: { phone, code: started.body.testCode, pin: '1234' } })).body.token
  }
  return { call, clock, staff, farmerToken, admin: () => staff(DEMO_ACCOUNTS.admin), agent: () => staff(DEMO_ACCOUNTS.agent), coordinator: () => staff(DEMO_ACCOUNTS.coordinator) }
}

const payment = (overrides = {}) => ({
  clientId: 'p-1',
  direction: 'collect',
  amount: 50,
  currency: 'GHS',
  network: 'mtn',
  phone: '+233241234567',
  ...overrides,
})

describe('creating a payment', () => {
  it('starts pending and settles after the delay', async () => {
    const t = await boot()
    const token = await t.farmerToken('+233241234567')
    const created = await t.call('POST', '/payments', { token, body: payment() })
    expect(created).toMatchObject({ status: 201, body: { status: 'pending' } })

    const read = () => t.call('GET', `/payments/${created.body.id}`, { token })
    expect((await read()).body.status).toBe('pending')
    t.clock.time += 1500
    expect((await read()).body.status).toBe('successful')
  })

  it('fails a phone number ending in 0000, so both outcomes can be shown', async () => {
    const t = await boot()
    const token = await t.farmerToken('+233241234567')
    const { body } = await t.call('POST', '/payments', { token, body: payment({ phone: '+233240000000' }) })
    t.clock.time += 1500
    expect((await t.call('GET', `/payments/${body.id}`, { token })).body.status).toBe('failed')
  })

  it('treats a repeat as the same payment, and refuses another account using the id', async () => {
    const t = await boot()
    const token = await t.farmerToken('+233241234567')
    const first = await t.call('POST', '/payments', { token, body: payment() })
    const repeat = await t.call('POST', '/payments', { token, body: payment() })
    expect(repeat).toMatchObject({ status: 200, body: { id: first.body.id } })

    const other = await t.farmerToken('+233200000888')
    expect((await t.call('POST', '/payments', { token: other, body: payment() })).status).toBe(409)
  })

  it.each([
    ['amount', { amount: 0 }],
    ['amount', { amount: 20_000 }],
    ['amount', { amount: '50' }],
    ['direction', { direction: 'refund' }],
    ['currency', { currency: 'USD' }],
    ['network', { network: 'mpesa' }],
    ['phone', { phone: '0241234567' }],
    ['clientId', { clientId: undefined }],
  ])('refuses a bad %s', async (field, overrides) => {
    const t = await boot()
    const result = await t.call('POST', '/payments', { token: await t.farmerToken('+233241234567'), body: payment(overrides) })
    expect(result).toMatchObject({ status: 400, body: { error: 'invalid_request', field } })
  })

  it('only lets a farmer create one', async () => {
    const t = await boot()
    expect((await t.call('POST', '/payments', { body: payment() })).status).toBe(401)
    expect((await t.call('POST', '/payments', { token: await t.agent(), body: payment() })).status).toBe(403)
  })
})

describe('a farmer\'s wallet', () => {
  it('counts only successful payments: received is paid out to them, paid is collected from them', async () => {
    const t = await boot()
    const token = await t.farmerToken('+233241234567')
    const send = (clientId, overrides) => t.call('POST', '/payments', { token, body: payment({ clientId, ...overrides }) })
    await send('a', { direction: 'payout', amount: 200 })
    await send('b', { direction: 'collect', amount: 50 })
    await send('c', { direction: 'payout', amount: 75, phone: '+233240000000' })
    t.clock.time += 500
    await send('d', { direction: 'payout', amount: 1000 })

    t.clock.time += 600
    const { body } = await t.call('GET', '/payments/me', { token })
    expect(body.balance).toEqual([{ currency: 'GHS', received: 200, paid: 50, amount: 150 }])
    expect(body.items).toHaveLength(4)
    expect(body.items[0]).toMatchObject({ clientId: 'd', status: 'pending' })
  })

  it('does not show another farmer\'s payment', async () => {
    const t = await boot()
    const mine = await t.farmerToken('+233241234567')
    const { body } = await t.call('POST', '/payments', { token: mine, body: payment() })
    const other = await t.farmerToken('+233200000888')
    expect((await t.call('GET', `/payments/${body.id}`, { token: other })).status).toBe(404)
  })
})

describe('payments seen by staff', () => {
  async function seed(t) {
    const agent = await t.agent()
    const registered = await t.call('POST', '/farmers', {
      token: agent,
      body: { clientId: 'f-1', name: 'Ama Mensah', countryCode: '+233', phoneNational: '241234567' },
    })
    const farmer = await t.farmerToken('+233241234567')
    await t.call('POST', '/payments', { token: farmer, body: payment({ clientId: 'in-1', direction: 'payout', amount: 300 }) })
    await t.call('POST', '/payments', { token: farmer, body: payment({ clientId: 'out-1', direction: 'collect', amount: 80 }) })
    t.clock.time += 1500
    return { agent, recordId: registered.body.id }
  }

  it('shows an agent the payments of farmers they registered, and nobody else\'s', async () => {
    const t = await boot()
    const { agent, recordId } = await seed(t)
    const history = await t.call('GET', `/farmers/${recordId}/payments`, { token: agent })
    expect(history.body.items).toHaveLength(2)
    expect(history.body.balance[0].amount).toBe(220)

    expect((await t.call('GET', '/farmers/999/payments', { token: agent })).status).toBe(404)
    const coordinator = await t.coordinator()
    expect((await t.call('GET', `/farmers/${recordId}/payments`, { token: coordinator })).status).toBe(200)
  })

  it('reports income per farmer to an admin and a coordinator', async () => {
    const t = await boot()
    await seed(t)
    for (const token of [await t.admin(), await t.coordinator()]) {
      const { body } = await t.call('GET', '/admin/income', { token })
      expect(body.items).toEqual([expect.objectContaining({ name: 'Ama Mensah', currency: 'GHS', received: 300 })])
    }
    expect((await t.call('GET', '/admin/income', { token: await t.agent() })).status).toBe(403)
  })

  it('adds payments to the dashboard figures', async () => {
    const t = await boot()
    await seed(t)
    const { body } = await t.call('GET', '/admin/stats', { token: await t.admin() })
    expect(body.payments).toEqual([{ currency: 'GHS', collected: 80, paidOut: 300 }])
  })

  it('exports payments as a spreadsheet, and records the export', async () => {
    const t = await boot()
    await seed(t)
    const admin = await t.admin()
    const csv = await t.call('GET', '/admin/export/payments.csv', { token: admin })
    expect(csv.status).toBe(200)
    expect(csv.body).toContain('id,clientId,farmerName,phoneE164,direction,amount,currency,network,status,createdAt')
    expect(csv.body).toContain('Ama Mensah')
    expect(csv.body.trim().split('\r\n')).toHaveLength(3)

    const audit = await t.call('GET', '/admin/audit', { token: admin })
    expect(audit.body.items[0]).toMatchObject({ action: 'export.payments', detail: '2 rows' })
  })
})

describe('loan requests', () => {
  const loan = (overrides = {}) => ({ clientId: 'l-1', amount: 800, currency: 'GHS', purpose: 'Fertiliser for two acres', ...overrides })

  it('are received once, however many times the phone sends them', async () => {
    const t = await boot()
    const token = await t.farmerToken('+233241234567')
    const first = await t.call('POST', '/loan-requests', { token, body: loan() })
    expect(first).toMatchObject({ status: 201, body: { status: 'received' } })
    expect(await t.call('POST', '/loan-requests', { token, body: loan() })).toMatchObject({ status: 200, body: { id: first.body.id } })
  })

  it.each([
    ['amount', { amount: -5 }],
    ['purpose', { purpose: '   ' }],
    ['currency', { currency: 'EUR' }],
  ])('refuse a bad %s', async (field, overrides) => {
    const t = await boot()
    const result = await t.call('POST', '/loan-requests', { token: await t.farmerToken('+233241234567'), body: loan(overrides) })
    expect(result).toMatchObject({ status: 400, body: { field } })
  })
})

describe('feedback', () => {
  const entry = (overrides = {}) => ({ clientId: 'fb-1', screen: 'wallet', message: 'Easy to use', rating: 5, appLanguage: 'en', ...overrides })

  it('is saved once and appears in the admin inbox, newest first', async () => {
    const t = await boot()
    const farmer = await t.farmerToken('+233241234567')
    const first = await t.call('POST', '/feedback', { token: farmer, body: entry() })
    expect(first.status).toBe(201)
    expect(await t.call('POST', '/feedback', { token: farmer, body: entry() })).toMatchObject({ status: 200, body: { id: first.body.id } })

    t.clock.time += 5000
    await t.call('POST', '/feedback', { token: await t.agent(), body: entry({ clientId: 'fb-2', message: 'Sync is slow', rating: null }) })

    const inbox = await t.call('GET', '/admin/activity?type=feedback', { token: await t.admin() })
    expect(inbox.body.items.map((item) => item.message)).toEqual(['Sync is slow', 'Easy to use'])
    expect(inbox.body.items[1]).toMatchObject({ role: 'farmer', screen: 'wallet', rating: 5 })
  })

  it('refuses an empty message and a rating out of range', async () => {
    const t = await boot()
    const token = await t.farmerToken('+233241234567')
    expect((await t.call('POST', '/feedback', { token, body: entry({ message: '  ' }) })).status).toBe(400)
    expect((await t.call('POST', '/feedback', { token, body: entry({ rating: 9 }) })).status).toBe(400)
  })

  it('keeps the inbox for admins, and knows only two inbox types', async () => {
    const t = await boot()
    expect((await t.call('GET', '/admin/activity?type=feedback', { token: await t.agent() })).status).toBe(403)
    const admin = await t.admin()
    expect((await t.call('GET', '/admin/activity?type=cropcheck', { token: admin })).body).toEqual({ items: [] })
    expect((await t.call('GET', '/admin/activity?type=other', { token: admin })).status).toBe(400)
  })
})
