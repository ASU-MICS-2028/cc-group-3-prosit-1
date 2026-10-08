// USSD for feature phones (Arkesel format) and the follow-up requests list.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, DEMO_ACCOUNTS, uid } from './harness.ts'

const servers = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

const GATEWAY = 'AGRO_USSD'

async function start(options = { ussdUserId: GATEWAY }) {
  const server = await createApp(options)
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
  let n = 0
  /** One USSD session: dial(), then press('1'), press('3') … like a handset would. */
  function session(msisdn) {
    const sessionID = `S-${++n}-${Date.now()}`
    const send = async (userData, newSession) =>
      (await call('POST', '/ussd', { body: { sessionID, userID: GATEWAY, newSession, msisdn, userData, network: 'MTN' } })).body
    return { dial: () => send('*928*77#', true), press: (key) => send(key, false) }
  }
  return { server, call, session, admin: () => staff(DEMO_ACCOUNTS.admin), agent: () => staff(DEMO_ACCOUNTS.agent), coordinator: () => staff(DEMO_ACCOUNTS.coordinator) }
}

describe('USSD', () => {
  it('is off until configured, and only answers our gateway account', async () => {
    const off = await start({})
    expect((await off.call('POST', '/ussd', { body: { sessionID: '1', userID: GATEWAY, newSession: true, msisdn: '233241234567', userData: '*928#' } })).status).toBe(404)
    const t = await start()
    expect((await t.call('POST', '/ussd', { body: { sessionID: '1', userID: 'someone-else', newSession: true, msisdn: '233241234567', userData: '*928#' } })).status).toBe(403)
  })

  it('asks an unknown caller for a language, then shows the main menu in it', async () => {
    const t = await start()
    const s = t.session('233241234567')
    const first = await s.dial()
    expect(first).toMatchObject({ continueSession: true, msisdn: '233241234567', userID: GATEWAY })
    expect(first.message).toContain('1 English')
    const twi = await s.press('2')
    expect(twi.message).toContain('Gua so boɔ')
  })

  it('greets a registered farmer in their language and shows their registration', async () => {
    const t = await start()
    await t.call('POST', '/farmers', {
      token: await t.agent(),
      body: { clientId: uid('u-1'), name: 'Kofi Ussd', countryCode: '+233', phoneNational: '241112222', preferredLanguage: 'ee', community: 'Ho', crops: ['yam'], farmSizeAcres: 3 },
    })
    const s = t.session('233241112222')
    expect((await s.dial()).message).toContain('Asi dzi nuhohowo')
    const reg = await s.press('3')
    expect(reg).toMatchObject({ continueSession: false })
    expect(reg.message).toContain('Kofi Ussd')
    expect(reg.message).toContain('Te')
  })

  it('reads market prices with the weekly change', async () => {
    const t = await start()
    const admin = await t.admin()
    const record = (pricePerKg, recordedOn) => t.call('POST', '/admin/market-prices', { token: admin, body: { country: 'GH', crop: 'tomato', pricePerKg, recordedOn } })
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    await record(8, weekAgo)
    await record(10, today)
    const s = t.session('233249998888')
    await s.dial()
    await s.press('1')
    const crops = await s.press('1')
    expect(crops.message).toContain('2 Tomato')
    const price = await s.press('2')
    expect(price).toMatchObject({ continueSession: false })
    expect(price.message).toContain('Tomato: GHS 10.00 per kg (up 25% this week)')
  })

  it('lists advice and reads one', async () => {
    const t = await start()
    await t.call('POST', '/admin/advice', { token: await t.admin(), body: { crop: 'maize', title: 'Plant early', body: 'Sow at the first rains.' } })
    const s = t.session('233249998887')
    await s.dial()
    await s.press('1')
    expect((await s.press('2')).message).toContain('1 Plant early')
    expect((await s.press('1')).message).toBe('Plant early: Sow at the first rains.')
  })

  it('records an agent-visit request that coordinators see and can close', async () => {
    const t = await start()
    const s = t.session('233249998886')
    await s.dial()
    await s.press('1')
    expect((await s.press('4')).message).toContain('1 Yes')
    expect((await s.press('1')).message).toContain('An agent will call +233249998886')

    const coordinator = await t.coordinator()
    const { body } = await t.call('GET', '/admin/requests?status=open', { token: coordinator })
    expect(body.items).toEqual([expect.objectContaining({ phone: '+233249998886', channel: 'ussd', kind: 'agent_visit', status: 'open', language: 'en', farmer: null })])
    const done = await t.call('POST', `/admin/requests/${body.items[0].id}/done`, { token: coordinator })
    expect(done.body).toMatchObject({ status: 'done', handledBy: 'Kwame Coordinator' })
    expect((await t.call('GET', '/admin/requests', { token: await t.agent() })).status).toBe(403)
  })

  it('gives today\'s weather for a registered farm, and explains when it cannot', async () => {
    const t = await start()
    t.server.ctx.weather = async (lat, lng) => (lat === 5.69 && lng === -0.03 ? { min: 23, max: 31, rainChance: 70 } : null)
    await t.call('POST', '/farmers', {
      token: await t.agent(),
      body: { clientId: uid('u-w'), name: 'Ama Weather', countryCode: '+233', phoneNational: '241113333', preferredLanguage: 'en', gps: { lat: 5.69, lng: -0.03, accuracy: 9, capturedAt: '2026-10-08T08:00:00Z' } },
    })
    const s = t.session('233241113333')
    await s.dial()
    expect((await s.press('5')).message).toBe('Today: 23-31°C, 70% chance of rain. Rain is likely: avoid spraying today.')
    const stranger = t.session('233240000001')
    await stranger.dial()
    await stranger.press('1')
    expect((await stranger.press('5')).message).toContain('needs your farm location')
  })

  it('repeats the menu on a wrong key and ends on 0', async () => {
    const t = await start()
    const s = t.session('233249998885')
    await s.dial()
    await s.press('1')
    expect((await s.press('9')).message).toMatch(/^Invalid choice\.\nAgroConnect/)
    expect(await s.press('0')).toMatchObject({ continueSession: false, message: 'Thank you for using AgroConnect.' })
  })
})
