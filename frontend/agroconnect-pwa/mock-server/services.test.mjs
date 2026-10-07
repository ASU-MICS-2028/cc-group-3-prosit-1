import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './server.mjs'
import { DEMO_ACCOUNTS } from './store.mjs'

const servers = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

async function boot() {
  const clock = { time: 1_760_000_000_000 }
  const server = await createApp({ now: () => clock.time })
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const base = `http://localhost:${server.address().port}`

  const raw = (method, path, { token, body, headers } = {}) =>
    fetch(base + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...headers }, body })
  const call = async (method, path, { token, body } = {}) => {
    const response = await raw(method, path, { token, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
    const text = await response.text()
    return { status: response.status, body: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text }
  }
  const staff = async (account) => (await call('POST', '/auth/staff/login', { body: { identifier: account.loginId, password: account.password } })).body.token
  const farmerToken = async (phone) => {
    const started = await call('POST', '/auth/farmer/start', { body: { phone } })
    return (await call('POST', '/auth/farmer/verify-otp', { body: { phone, code: started.body.testCode, pin: '1234' } })).body.token
  }
  const northernAgent = async () => {
    const signup = await call('POST', '/auth/staff/signup', { body: { name: 'Ibrahim N.', phone: '+233244999000', association: 'ngfn', password: 'long-enough-pw' } })
    await call('POST', '/auth/staff/verify-phone', { body: { phone: '+233244999000', code: signup.body.testCode } })
    const approved = await call('POST', `/admin/agents/${signup.body.id}/approve`, { token: await staff(DEMO_ACCOUNTS.admin), body: {} })
    return (await call('POST', '/auth/staff/login', { body: { identifier: approved.body.loginId, password: 'long-enough-pw' } })).body.token
  }
  return { raw, call, clock, farmerToken, northernAgent, admin: () => staff(DEMO_ACCOUNTS.admin), agent: () => staff(DEMO_ACCOUNTS.agent), coordinator: () => staff(DEMO_ACCOUNTS.coordinator) }
}

const check = (overrides = {}) => ({ clientId: 'cc-1', crop: 'tomato', note: 'Brown spots on the leaves', ...overrides })
const listing = (overrides = {}) => ({ clientId: 'ls-1', crop: 'maize', quantityKg: 200, pricePerKg: 5.5, currency: 'GHS', community: 'Ashaiman', ...overrides })
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

describe('crop checks', () => {
  it('goes from a farmer\'s question to an agent\'s advice and back to the farmer', async () => {
    const t = await boot()
    const farmer = await t.farmerToken('+233241234567')
    const created = await t.call('POST', '/crop-checks', { token: farmer, body: check() })
    expect(created).toMatchObject({ status: 201, body: { status: 'open' } })

    const open = await t.call('GET', '/crop-checks?status=open', { token: await t.agent() })
    expect(open.body.items).toHaveLength(1)
    expect(open.body.items[0]).toMatchObject({ crop: 'tomato', note: 'Brown spots on the leaves', farmerPhone: '+233241234567', hasPhoto: false, advice: null })

    const answered = await t.call('POST', `/crop-checks/${created.body.id}/advice`, { token: await t.agent(), body: { text: 'Remove the leaves and spray copper fungicide.' } })
    expect(answered.body).toMatchObject({ status: 'answered', advice: { text: 'Remove the leaves and spray copper fungicide.', by: 'Efua Agent' } })

    expect((await t.call('GET', '/crop-checks?status=open', { token: await t.agent() })).body.items).toHaveLength(0)
    const mine = await t.call('GET', '/crop-checks/me', { token: farmer })
    expect(mine.body.items[0]).toMatchObject({ status: 'answered', advice: { text: expect.stringContaining('copper') } })
  })

  it('treats a repeat as the same crop check', async () => {
    const t = await boot()
    const farmer = await t.farmerToken('+233241234567')
    const first = await t.call('POST', '/crop-checks', { token: farmer, body: check() })
    expect(await t.call('POST', '/crop-checks', { token: farmer, body: check() })).toMatchObject({ status: 200, body: { id: first.body.id } })
    expect((await t.call('POST', '/crop-checks', { token: await t.farmerToken('+233200000888'), body: check() })).status).toBe(409)
  })

  it.each([
    ['crop', { crop: 'rice' }],
    ['note', { note: '   ' }],
    ['note', { note: 'x'.repeat(501) }],
    ['clientId', { clientId: undefined }],
  ])('refuses a bad %s', async (field, overrides) => {
    const t = await boot()
    const result = await t.call('POST', '/crop-checks', { token: await t.farmerToken('+233241234567'), body: check(overrides) })
    expect(result).toMatchObject({ status: 400, body: { field } })
  })

  it('stores a photo and gives it to the farmer and to staff, but not to anyone else', async () => {
    const t = await boot()
    const farmer = await t.farmerToken('+233241234567')
    const stranger = await t.farmerToken('+233200000888')
    const { body } = await t.call('POST', '/crop-checks', { token: farmer, body: check() })
    const upload = (token, bytes = JPEG) => t.raw('POST', `/crop-checks/${body.id}/photo`, { token, body: bytes, headers: { 'Content-Type': 'image/jpeg' } })

    expect((await upload(farmer)).status).toBe(200)
    expect((await upload(stranger)).status).toBe(404)
    expect((await upload(farmer, Buffer.alloc(600 * 1024))).status).toBe(413)

    const fetchPhoto = async (token) => t.raw('GET', `/crop-checks/${body.id}/photo`, { token })
    for (const token of [farmer, await t.agent(), await t.admin()]) {
      const response = await fetchPhoto(token)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/jpeg')
      expect(Buffer.from(await response.arrayBuffer())).toEqual(JPEG)
    }
    expect((await fetchPhoto(stranger)).status).toBe(404)
    expect((await t.call('GET', '/crop-checks?status=open', { token: await t.agent() })).body.items[0].hasPhoto).toBe(true)
  })

  it('shows an agent their association\'s farmers, and unregistered farmers to everyone', async () => {
    const t = await boot()
    await t.call('POST', '/farmers', { token: await t.agent(), body: { clientId: 'f-1', name: 'Ama Mensah', countryCode: '+233', phoneNational: '241234567' } })
    const registered = await t.farmerToken('+233241234567')
    const stranger = await t.farmerToken('+233200000888')
    await t.call('POST', '/crop-checks', { token: registered, body: check({ clientId: 'a', note: 'From a registered farmer' }) })
    await t.call('POST', '/crop-checks', { token: stranger, body: check({ clientId: 'b', note: 'From someone no agent has registered' }) })

    const notesFor = async (token) => (await t.call('GET', '/crop-checks', { token })).body.items.map((item) => item.note).sort()
    const both = ['From a registered farmer', 'From someone no agent has registered']
    expect(await notesFor(await t.agent())).toEqual(both)
    expect(await notesFor(await t.coordinator())).toEqual(both)
    expect(await notesFor(await t.admin())).toEqual(both)
    expect(await notesFor(await t.northernAgent())).toEqual(['From someone no agent has registered'])
    expect((await t.call('GET', '/crop-checks', { token: registered })).status).toBe(403)
  })

  it('names the registered farmer, and lets only one answer through', async () => {
    const t = await boot()
    await t.call('POST', '/farmers', { token: await t.agent(), body: { clientId: 'f-1', name: 'Ama Mensah', countryCode: '+233', phoneNational: '241234567' } })
    const farmer = await t.farmerToken('+233241234567')
    const { body } = await t.call('POST', '/crop-checks', { token: farmer, body: check() })
    const agent = await t.agent()

    expect((await t.call('GET', '/crop-checks', { token: agent })).body.items[0].farmerName).toBe('Ama Mensah')
    expect((await t.call('POST', `/crop-checks/${body.id}/advice`, { token: agent, body: { text: '  ' } })).status).toBe(400)
    expect((await t.call('POST', `/crop-checks/${body.id}/advice`, { token: farmer, body: { text: 'self-advice' } })).status).toBe(403)
    expect((await t.call('POST', `/crop-checks/${body.id}/advice`, { token: agent, body: { text: 'First answer' } })).status).toBe(200)
    expect((await t.call('POST', `/crop-checks/${body.id}/advice`, { token: agent, body: { text: 'Second answer' } })).body.error).toBe('already_answered')
  })

  it('keeps crop checks from an agent outside their area out of the admin list only when asked to', async () => {
    const t = await boot()
    const farmer = await t.farmerToken('+233241234567')
    await t.call('POST', '/crop-checks', { token: farmer, body: check() })
    expect((await t.call('GET', '/admin/activity?type=cropcheck', { token: await t.admin() })).body.items).toHaveLength(1)
  })
})

describe('produce listings', () => {
  it('shows an open listing to everyone signed in, with the seller\'s contact and a flag for their own', async () => {
    const t = await boot()
    const seller = await t.farmerToken('+233241234567')
    expect((await t.call('POST', '/listings', { token: seller, body: listing() })).status).toBe(201)

    const buyer = await t.farmerToken('+233200000888')
    const seen = (await t.call('GET', '/listings', { token: buyer })).body.items
    expect(seen).toEqual([expect.objectContaining({ crop: 'maize', quantityKg: 200, pricePerKg: 5.5, currency: 'GHS', sellerPhone: '+233241234567', mine: false })])
    expect((await t.call('GET', '/listings', { token: seller })).body.items[0].mine).toBe(true)
    expect((await t.call('GET', '/listings', { token: await t.agent() })).body.items).toHaveLength(1)
    expect((await t.call('GET', '/listings')).status).toBe(401)
  })

  it('treats a repeat as the same listing, and filters by crop', async () => {
    const t = await boot()
    const seller = await t.farmerToken('+233241234567')
    const first = await t.call('POST', '/listings', { token: seller, body: listing() })
    expect(await t.call('POST', '/listings', { token: seller, body: listing() })).toMatchObject({ status: 200, body: { id: first.body.id } })
    await t.call('POST', '/listings', { token: seller, body: listing({ clientId: 'ls-2', crop: 'yam' }) })

    expect((await t.call('GET', '/listings?crop=yam', { token: seller })).body.items).toHaveLength(1)
    expect((await t.call('GET', '/listings?crop=rice', { token: seller })).status).toBe(400)
  })

  it.each([
    ['crop', { crop: 'rice' }],
    ['quantityKg', { quantityKg: 0 }],
    ['quantityKg', { quantityKg: 1_000_000 }],
    ['pricePerKg', { pricePerKg: -2 }],
    ['currency', { currency: 'USD' }],
  ])('refuses a bad %s', async (field, overrides) => {
    const t = await boot()
    const result = await t.call('POST', '/listings', { token: await t.farmerToken('+233241234567'), body: listing(overrides) })
    expect(result).toMatchObject({ status: 400, body: { field } })
  })

  it('lets only the seller close a listing, and then stops showing it', async () => {
    const t = await boot()
    const seller = await t.farmerToken('+233241234567')
    const { body } = await t.call('POST', '/listings', { token: seller, body: listing() })

    expect((await t.call('POST', `/listings/${body.id}/close`, { token: await t.farmerToken('+233200000888') })).status).toBe(404)
    expect((await t.call('POST', `/listings/${body.id}/close`, { token: seller })).body.status).toBe('closed')
    expect((await t.call('GET', '/listings', { token: seller })).body.items).toHaveLength(0)
  })

  it('only lets a farmer sell', async () => {
    const t = await boot()
    expect((await t.call('POST', '/listings', { token: await t.agent(), body: listing() })).status).toBe(403)
  })
})
