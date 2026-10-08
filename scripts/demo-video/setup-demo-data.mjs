// Gives the live demo accounts something real to show before recording, so no screen in the
// video falls back to "Sample prices" or "No agent has registered you yet". Safe to re-run:
// prices are upserts per crop and day, and the profile and advice are only created once.
// Prices are illustrative demo values, not market data.
const API = process.env.API_URL ?? 'https://api.agroconnect.space'

async function call(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function staffToken(identifier, password) {
  const { status, json } = await call('/auth/staff/login', { body: { identifier, password } })
  if (status !== 200) throw new Error(`${identifier} sign-in failed: ${status} ${JSON.stringify(json)}`)
  return json.token
}

const admin = await staffToken('ADM-001', 'admin-test-pass')
const agent = await staffToken('AG-0001', 'agent-test-pass')

// GHS per kg: [a week ago, today]
const PRICES = { maize: [6.2, 6.5], tomato: [10.5, 9.0], cassava: [2.4, 2.4], pepper: [13.0, 14.0], okro: [8.0, 8.5], yam: [7.0, 7.5], plantain: [5.5, 5.0] }
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' })
for (const [crop, [before, now]] of Object.entries(PRICES)) {
  for (const [pricePerKg, recordedOn] of [[before, day(-7)], [now, day(0)]]) {
    const { status } = await call('/admin/market-prices', { token: admin, body: { country: 'GH', crop, pricePerKg, recordedOn } })
    if (status >= 300) throw new Error(`price ${crop} ${recordedOn}: ${status}`)
  }
}
console.log('prices recorded for', day(0))

const advice = await call('/advice', { token: admin })
if ((advice.json?.items ?? []).length === 0) {
  const cards = [
    { crop: 'maize', title: 'Scout for fall armyworm', body: 'Walk the field twice a week from emergence. Look for ragged holes and sawdust-like frass in the funnel. Act early, while the larvae are small.' },
    { crop: 'tomato', title: 'Water at the base', body: 'Wet leaves invite blight. Water early in the morning at the foot of the plant and stake plants so the leaves stay off the soil.' },
    { crop: 'cassava', title: 'Plant healthy cuttings', body: 'Cut 20 to 25 cm stems from mature, disease-free plants. Plant them at an angle with two thirds below the soil.' },
  ]
  for (const card of cards) await call('/admin/advice', { token: admin, body: card })
  console.log('advice cards published')
}

// Akosua (the demo farmer) has a farm profile, as if Efua (AG-0001) had registered her.
const farmer = await call('/auth/farmer/login', { body: { phone: '+233200000010', pin: '1234' } })
const me = await call('/farmers/me', { token: farmer.json?.token })
if (me.status === 404) {
  const { status, json } = await call('/farmers', {
    token: agent,
    body: {
      clientId: crypto.randomUUID(),
      name: 'Akosua Farmer',
      countryCode: '+233',
      phoneNational: '200000010',
      preferredLanguage: 'tw',
      gender: 'female',
      community: 'Ashaiman',
      region: 'Greater Accra',
      farmSizeAcres: 1.5,
      crops: ['maize', 'tomato', 'pepper'],
      gps: { lat: 5.6941, lng: -0.0297, accuracy: 8, capturedAt: new Date().toISOString() },
      consent: true,
    },
  })
  if (status >= 300) throw new Error(`Akosua's profile: ${status} ${JSON.stringify(json)}`)
  console.log('farm profile created for Akosua')
}
