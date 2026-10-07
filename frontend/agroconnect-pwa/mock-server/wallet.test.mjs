// Drives the PWA's real outbox sender, payments client and polling against the mock server,
// so a mismatch with PAYMENTS-CONTRACT.md shows up here and not on a phone.
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './server.mjs'

let server
let mods
const clock = { time: 1_760_000_000_000 }

beforeAll(async () => {
  server = await createApp({ now: () => clock.time, paymentDelayMs: 1000 })
  await new Promise((resolve) => server.listen(0, resolve))
  const url = `http://localhost:${server.address().port}`
  for (const name of ['VITE_API_URL', 'VITE_AUTH_URL', 'VITE_ADMIN_URL', 'VITE_PAYMENTS_URL']) vi.stubEnv(name, url)
  vi.resetModules()
  mods = {
    auth: await import('../src/auth/authApi.ts'),
    token: await import('../src/auth/authedRequest.ts'),
    outboxDb: await import('../src/db/outbox.ts'),
    db: await import('../src/db/db.ts'),
    sender: await import('../src/sync/outbox.ts'),
    payments: await import('../src/payments/paymentsApi.ts'),
    polling: await import('../src/payments/polling.ts'),
    history: await import('../src/payments/history.ts'),
    admin: await import('../src/admin/adminApi.ts'),
  }
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

async function signInFarmer(phone) {
  const started = await mods.auth.startFarmer(phone)
  const { token } = await mods.auth.verifyFarmerOtp(phone, started.testCode, '1234')
  mods.token.setTokenProvider({ getToken: () => token, refresh: async () => null })
}

describe('the wallet, from the phone to the server and back', () => {
  it('sends a queued payment, follows it until it settles, and shows it in the wallet', async () => {
    await signInFarmer('0241234567')
    const item = await mods.outboxDb.addToOutbox('payment', {
      direction: 'payout', amount: 120, currency: 'GHS', network: 'mtn', phone: '+233241234567',
    })

    await mods.sender.sendOutbox()
    const sent = await mods.db.db.outbox.get(item.clientId)
    expect(sent).toMatchObject({ status: 'sent', remote: { status: 'pending' } })

    const fetchStatus = async (id) => (await mods.payments.fetchPayment(id)).status
    expect((await mods.polling.refreshPendingPayments(fetchStatus)).stillPending).toBe(1)
    clock.time += 1500
    expect(await mods.polling.refreshPendingPayments(fetchStatus)).toEqual({ changed: 1, stillPending: 0 })

    const wallet = await mods.payments.fetchWallet()
    expect(wallet.balance).toEqual([{ currency: 'GHS', received: 120, paid: 0, amount: 120 }])
    const [row] = mods.history.buildHistory(await mods.outboxDb.listOutbox('payment'), wallet.items)
    expect(row).toMatchObject({ clientId: item.clientId, state: 'successful', amount: 120 })
  })

  it('marks a request the server refuses as needing attention, with the server\'s reason', async () => {
    await signInFarmer('0200000555')
    const item = await mods.outboxDb.addToOutbox('payment', {
      direction: 'collect', amount: 999_999, currency: 'GHS', network: 'mtn', phone: '+233200000555',
    })
    await mods.sender.sendOutbox()
    const refused = await mods.db.db.outbox.get(item.clientId)
    expect(refused.status).toBe('attention')
    expect(refused.errorMessage).toMatch(/at most/)
  })

  it('sends a loan request and feedback, and the admin sees the feedback', async () => {
    await signInFarmer('0200000777')
    await mods.outboxDb.addToOutbox('loanRequest', { amount: 800, currency: 'GHS', purpose: 'Fertiliser' })
    await mods.outboxDb.addToOutbox('feedback', { screen: 'wallet', message: 'Clear and quick', rating: 5, appLanguage: 'en' })
    await mods.sender.sendOutbox()

    const statuses = (await mods.db.db.outbox.toArray()).filter((i) => ['loanRequest', 'feedback'].includes(i.kind)).map((i) => i.status)
    expect(statuses).toEqual(['sent', 'sent'])

    const { token } = await mods.auth.loginStaff('ADM-001', 'admin-test-pass')
    mods.token.setTokenProvider({ getToken: () => token, refresh: async () => null })
    const inbox = await mods.admin.fetchFeedbackInbox()
    expect(inbox[0]).toMatchObject({ message: 'Clear and quick', role: 'farmer', rating: 5 })
    expect((await mods.admin.fetchIncome())[0]).toMatchObject({ currency: 'GHS', received: 120 })
    expect(await (await mods.admin.fetchCsv('payments')).text()).toContain('farmerName')
  })
})
