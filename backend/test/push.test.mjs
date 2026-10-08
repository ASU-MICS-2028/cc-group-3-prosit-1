// Web Push: subscriptions, and the events that notify (crop check answered, payment settled, new advice,
// agent approved). A fake sender records what would have been pushed.
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { votexProvider } from '../src/integrations.ts'
import { createApp, DEMO_ACCOUNTS, uid } from './harness.ts'

const servers = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})
const realFetch = globalThis.fetch

function fakePush() {
  const sent = []
  const gone = new Set()
  return { sent, gone, publicKey: 'BPublicKeyForTests', send: async (sub, payload) => (gone.has(sub.endpoint) ? 'gone' : (sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }), 'ok')) }
}

async function start(options = {}) {
  const server = await createApp(options)
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const push = fakePush()
  server.ctx.push = push
  const base = `http://localhost:${server.address().port}`
  const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
    const response = await realFetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : undefined }
  }
  const staff = async (account) => (await call('POST', '/auth/staff/login', { body: { identifier: account.loginId, password: account.password } })).body.token
  const farmer = async (phone = DEMO_ACCOUNTS.farmer.phone) => {
    if (phone === DEMO_ACCOUNTS.farmer.phone) return (await call('POST', '/auth/farmer/login', { body: DEMO_ACCOUNTS.farmer })).body.token
    const started = await call('POST', '/auth/farmer/start', { body: { phone } })
    return (await call('POST', '/auth/farmer/verify-otp', { body: { phone, code: started.body.testCode, pin: '1234' } })).body.token
  }
  const subscribe = (token, endpoint) => call('POST', '/push/subscriptions', { token, body: { endpoint, keys: { p256dh: 'BKey_p256dh-value', auth: 'authSecret' } } })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
  return { server, push, call, staff, farmer, subscribe, settle, admin: () => staff(DEMO_ACCOUNTS.admin), agent: () => staff(DEMO_ACCOUNTS.agent) }
}

describe('push notifications', () => {
  it('is off without VAPID keys', async () => {
    const t = await start()
    t.server.ctx.push = null
    expect((await t.call('GET', '/push/key')).status).toBe(404)
  })

  it('serves the public key and validates subscriptions', async () => {
    const t = await start()
    expect((await t.call('GET', '/push/key')).body).toEqual({ publicKey: 'BPublicKeyForTests' })
    const token = await t.farmer()
    expect((await t.subscribe(token, 'https://push.example/abc123456789')).status).toBe(201)
    expect((await t.call('POST', '/push/subscriptions', { token, body: { endpoint: 'http://insecure.example/x' } })).body).toMatchObject({ field: 'endpoint' })
    expect((await t.call('POST', '/push/subscriptions', { body: { endpoint: 'https://push.example/abc' } })).status).toBe(401)
  })

  it('tells a farmer their crop check was answered, in their language', async () => {
    const t = await start()
    const agent = await t.agent()
    await t.call('POST', '/farmers', { token: agent, body: { clientId: uid('pf'), name: 'Esi Push', countryCode: '+233', phoneNational: '245551212', preferredLanguage: 'tw' } })
    const farmer = await t.farmer('+233245551212')
    await t.subscribe(farmer, 'https://push.example/esi-phone-1')
    const { body: check } = await t.call('POST', '/crop-checks', { token: farmer, body: { clientId: uid('cc'), crop: 'tomato', note: 'Spots' } })
    await t.call('POST', `/crop-checks/${check.id}/advice`, { token: agent, body: { text: 'Spray copper.' } })
    await t.settle()
    expect(t.push.sent).toEqual([expect.objectContaining({ endpoint: 'https://push.example/esi-phone-1', title: 'Wɔabua wo nnɔbae nhwehwɛmu', tag: 'cropCheckAnswered' })])
  })

  it('tells every subscribed farmer about new advice, and drops subscriptions that are gone', async () => {
    const t = await start()
    await t.subscribe(await t.farmer(), 'https://push.example/farmer-a-1')
    await t.subscribe(await t.farmer('+233245551313'), 'https://push.example/farmer-b-1')
    await t.subscribe(await t.agent(), 'https://push.example/agent-only-1')
    t.push.gone.add('https://push.example/farmer-b-1')
    await t.call('POST', '/admin/advice', { token: await t.admin(), body: { crop: 'maize', title: 'Plant now', body: 'The rains have started.' } })
    await t.settle()
    expect(t.push.sent.map((s) => [s.endpoint, s.body])).toEqual([['https://push.example/farmer-a-1', 'Plant now']])
    const left = await t.server.ctx.db.query('SELECT endpoint FROM push_subscriptions ORDER BY endpoint')
    expect(left.rows.map((r) => r.endpoint)).toEqual(['https://push.example/agent-only-1', 'https://push.example/farmer-a-1'])
  })

  it('tells an agent their account was approved, with their ID', async () => {
    const t = await start()
    const pending = await t.call('POST', '/auth/staff/login', { body: { identifier: DEMO_ACCOUNTS.pendingAgent.phone, password: DEMO_ACCOUNTS.pendingAgent.password } })
    expect(pending.status).toBe(403)
    await t.server.ctx.db.query(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES ('https://push.example/pat-1', 'U-pending', 'k', 'a')`)
    await t.call('POST', '/admin/agents/U-pending/approve', { token: await t.admin(), body: {} })
    await t.settle()
    expect(t.push.sent[0]).toMatchObject({ title: 'Your account is approved' })
    expect(t.push.sent[0].body).toMatch(/AG-\d{4}/)
  })

  it('tells a farmer when a votex365 payment settles', async () => {
    vi.stubGlobal('fetch', async (_url, init) =>
      init?.method === 'POST' ? Response.json({ id: 'vx_9', reference: JSON.parse(init.body).reference, status: 'pending', checkout_url: 'https://pay.example/9' }, { status: 201 }) : Response.json({ status: 'pending' }),
    )
    const secret = { api_key: 'k', webhook_secret: 'whsec_x' }
    const t = await start({ checkout: votexProvider({ votexBaseUrl: 'https://votex.test', paymentReturnUrl: 'https://app.example/' }, async () => secret) })
    const farmer = await t.farmer()
    await t.subscribe(farmer, 'https://push.example/akosua-1')
    await t.call('POST', '/payments', { token: farmer, body: { clientId: uid('pay'), direction: 'collect', amount: 12.5, currency: 'GHS', network: 'mtn', phone: '+233200000010' } })
    const event = JSON.stringify({ id: 'e', event: 'payment.succeeded', data: { id: 'vx_9', reference: uid('pay'), status: 'paid' } })
    const ts = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', secret.webhook_secret).update(`${ts}.${event}`).digest('hex')
    await t.call('POST', '/webhooks/votex365', { raw: event, headers: { 'X-Votex-Webhook-Timestamp': ts, 'X-Votex-Webhook-Signature': signature } })
    await t.settle()
    expect(t.push.sent).toEqual([expect.objectContaining({ title: 'Payment successful', body: 'Your payment of GHS 12.50 went through.' })])
  })
})
