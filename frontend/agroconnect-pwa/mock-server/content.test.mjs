// Contract tests for docs/CONTENT-CONTRACT.md (market prices and advice cards). The same tests run against
// the real API in backend/test/content.test.mjs.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './server.mjs'
import { DEMO_ACCOUNTS } from './store.mjs'

const servers = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

async function boot() {
  const clock = { time: Date.parse('2026-10-08T10:00:00Z') }
  const server = await createApp({ now: () => clock.time })
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
  const farmer = async () => (await call('POST', '/auth/farmer/login', { body: DEMO_ACCOUNTS.farmer })).body.token
  return { call, clock, admin: () => staff(DEMO_ACCOUNTS.admin), coordinator: () => staff(DEMO_ACCOUNTS.coordinator), agent: () => staff(DEMO_ACCOUNTS.agent), farmer }
}

describe('market prices', () => {
  it('is empty until something is recorded', async () => {
    const t = await boot()
    const { status, body } = await t.call('GET', '/market-prices?country=GH', { token: await t.farmer() })
    expect(status).toBe(200)
    expect(body).toEqual({ country: 'GH', currency: 'GHS', updatedOn: null, items: [] })
  })

  it('shows the latest price per crop and the change against a week earlier', async () => {
    const t = await boot()
    const admin = await t.admin()
    const record = (crop, pricePerKg, recordedOn) => t.call('POST', '/admin/market-prices', { token: admin, body: { country: 'GH', crop, pricePerKg, recordedOn } })
    // Recorded out of order: the week-earlier price (1 Oct) arrives last, and 30 Sep is older still.
    expect((await record('maize', 4, '2026-09-30')).status).toBe(201)
    await record('maize', 5.4, '2026-10-05')
    await record('maize', 5.5, '2026-10-08')
    await record('tomato', 8, '2026-10-08')
    await record('maize', 5, '2026-10-01')

    const { body } = await t.call('GET', '/market-prices?country=GH', { token: await t.farmer() })
    expect(body.updatedOn).toBe('2026-10-08')
    expect(body.items).toEqual([
      { crop: 'maize', price: 5.5, change: 10, recordedOn: '2026-10-08' },
      { crop: 'tomato', price: 8, change: 0, recordedOn: '2026-10-08' },
    ])
    const nigeria = await t.call('GET', '/market-prices?country=NG', { token: await t.farmer() })
    expect(nigeria.body.items).toEqual([])
  })

  it('replaces a price recorded again on the same day', async () => {
    const t = await boot()
    const token = await t.coordinator()
    await t.call('POST', '/admin/market-prices', { token, body: { country: 'GH', crop: 'yam', pricePerKg: 12 } })
    const again = await t.call('POST', '/admin/market-prices', { token, body: { country: 'GH', crop: 'yam', pricePerKg: 12.5 } })
    expect(again).toMatchObject({ status: 200, body: { price: 12.5, recordedOn: '2026-10-08' } })
    const { body } = await t.call('GET', '/market-prices?country=GH', { token })
    expect(body.items).toEqual([{ crop: 'yam', price: 12.5, change: 0, recordedOn: '2026-10-08' }])
  })

  it('refuses bad values, future dates and other roles', async () => {
    const t = await boot()
    const admin = await t.admin()
    const post = (body, token = admin) => t.call('POST', '/admin/market-prices', { token, body: { country: 'GH', crop: 'maize', pricePerKg: 5, ...body } })
    expect((await post({ country: 'US' })).body).toMatchObject({ error: 'invalid_request', field: 'country' })
    expect((await post({ crop: 'rice' })).body).toMatchObject({ field: 'crop' })
    expect((await post({ pricePerKg: 0 })).body).toMatchObject({ field: 'pricePerKg' })
    expect((await post({ recordedOn: '2026-10-09' })).body).toMatchObject({ field: 'recordedOn' })
    expect((await post({}, await t.agent())).status).toBe(403)
    expect((await post({}, await t.farmer())).status).toBe(403)
    expect((await t.call('GET', '/market-prices?country=XX', { token: admin })).status).toBe(400)
    expect((await t.call('GET', '/market-prices?country=GH')).status).toBe(401)
  })
})

describe('advice cards', () => {
  it('publishes cards newest first and hides archived ones', async () => {
    const t = await boot()
    const admin = await t.admin()
    const first = await t.call('POST', '/admin/advice', { token: admin, body: { crop: 'maize', title: 'Plant at the start of the rains', body: 'Sow when the soil is moist.' } })
    expect(first.status).toBe(201)
    await t.call('POST', '/admin/advice', { token: await t.coordinator(), body: { crop: 'tomato', title: 'Water at the base', body: 'Wet leaves invite blight.' } })

    const farmer = await t.farmer()
    const { body } = await t.call('GET', '/advice', { token: farmer })
    expect(body.items.map((card) => card.title)).toEqual(['Water at the base', 'Plant at the start of the rains'])
    expect(body.items[0]).toMatchObject({ crop: 'tomato', byName: 'Kwame Coordinator' })

    expect(await t.call('POST', `/admin/advice/${first.body.id}/archive`, { token: admin })).toMatchObject({ status: 200, body: { archived: true } })
    expect((await t.call('GET', '/advice', { token: farmer })).body.items).toHaveLength(1)
    expect((await t.call('POST', '/admin/advice/AD-999/archive', { token: admin })).status).toBe(404)
  })

  it('checks the card and who may publish it', async () => {
    const t = await boot()
    const admin = await t.admin()
    const card = { crop: 'maize', title: 'A title', body: 'A body' }
    expect((await t.call('POST', '/admin/advice', { token: admin, body: { ...card, title: '' } })).body).toMatchObject({ field: 'title' })
    expect((await t.call('POST', '/admin/advice', { token: admin, body: { ...card, body: 'x'.repeat(501) } })).body).toMatchObject({ field: 'body' })
    expect((await t.call('POST', '/admin/advice', { token: admin, body: { ...card, crop: 'rice' } })).body).toMatchObject({ field: 'crop' })
    expect((await t.call('POST', '/admin/advice', { token: await t.agent(), body: card })).status).toBe(403)
  })
})
