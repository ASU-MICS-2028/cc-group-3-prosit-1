// Drives the PWA's real outbox sender and API clients against the mock server, so a mismatch with
// ADVICE-CONTRACT.md or LISTINGS-CONTRACT.md shows up here and not on a phone.
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './server.mjs'

let server
let mods

beforeAll(async () => {
  server = await createApp()
  await new Promise((resolve) => server.listen(0, resolve))
  const url = `http://localhost:${server.address().port}`
  for (const name of ['VITE_API_URL', 'VITE_AUTH_URL', 'VITE_ADMIN_URL', 'VITE_PAYMENTS_URL', 'VITE_ADVICE_URL', 'VITE_LISTINGS_URL']) vi.stubEnv(name, url)
  vi.resetModules()
  mods = {
    auth: await import('../src/auth/authApi.ts'),
    token: await import('../src/auth/authedRequest.ts'),
    outbox: await import('../src/db/outbox.ts'),
    db: await import('../src/db/db.ts'),
    sender: await import('../src/sync/outbox.ts'),
    advice: await import('../src/advice/adviceApi.ts'),
    merge: await import('../src/advice/merge.ts'),
    listings: await import('../src/listings/listingsApi.ts'),
    admin: await import('../src/admin/adminApi.ts'),
  }
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

async function signInFarmer(phone, pin = '1234') {
  const started = await mods.auth.startFarmer(phone)
  const { token } = started.next === 'otp'
    ? await mods.auth.verifyFarmerOtp(phone, started.testCode, pin)
    : await mods.auth.loginFarmer(phone, pin)
  mods.token.setTokenProvider({ getToken: () => token, refresh: async () => null })
}

async function signInStaff(identifier, password) {
  const { token } = await mods.auth.loginStaff(identifier, password)
  mods.token.setTokenProvider({ getToken: () => token, refresh: async () => null })
}

describe('crop checks, from the farmer\'s phone to an agent and back', () => {
  it('sends the question and the photo, lets an agent answer, and shows the answer to the farmer', async () => {
    await signInFarmer('0241234567')
    const photo = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 1, 2, 3])], { type: 'image/jpeg' })
    const item = await mods.outbox.addToOutbox('cropCheck', { crop: 'tomato', note: 'Brown spots', photo })
    await mods.sender.sendOutbox()
    expect(await mods.db.db.outbox.get(item.clientId)).toMatchObject({ status: 'sent', remote: { status: 'open' } })

    await signInStaff('AG-0001', 'agent-test-pass')
    const [waiting] = await mods.advice.fetchCropChecks('open')
    expect(waiting).toMatchObject({ crop: 'tomato', note: 'Brown spots', hasPhoto: true, farmerPhone: '+233241234567' })
    expect(Buffer.from(await (await mods.advice.fetchCropCheckPhoto(waiting.id)).arrayBuffer())).toEqual(Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]))
    expect((await mods.advice.giveAdvice(waiting.id, 'Spray copper fungicide.')).status).toBe('answered')
    expect(await mods.advice.fetchCropChecks('open')).toHaveLength(0)

    await signInFarmer('0241234567')
    const rows = mods.merge.buildCheckRows(await mods.outbox.listOutbox('cropCheck'), await mods.advice.fetchMyCropChecks())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: 'answered', advice: { text: 'Spray copper fungicide.', by: 'Efua Agent' } })
  })

  it('shows the admin every crop check', async () => {
    await signInStaff('ADM-001', 'admin-test-pass')
    expect(await mods.advice.fetchAdminCropChecks()).toHaveLength(1)
  })
})

describe('produce listings, from a seller to a buyer', () => {
  it('sends a listing, shows it to another farmer with the seller\'s contact, and removes it once sold', async () => {
    await signInFarmer('0200000555')
    const item = await mods.outbox.addToOutbox('listing', { crop: 'maize', quantityKg: 150, pricePerKg: 5.5, currency: 'GHS', community: 'Ashaiman' })
    await mods.sender.sendOutbox()
    const sent = await mods.db.db.outbox.get(item.clientId)
    expect(sent).toMatchObject({ status: 'sent', remote: { status: 'open' } })

    await signInFarmer('0200000666')
    const [seen] = await mods.listings.fetchListings('maize')
    expect(seen).toMatchObject({ crop: 'maize', quantityKg: 150, pricePerKg: 5.5, sellerPhone: '+233200000555', mine: false })

    await signInFarmer('0200000555')
    expect((await mods.listings.fetchListings())[0].mine).toBe(true)
    expect(await mods.listings.closeListing(sent.remote.id)).toMatchObject({ status: 'closed' })
    expect(await mods.listings.fetchListings()).toHaveLength(0)
  })
})
