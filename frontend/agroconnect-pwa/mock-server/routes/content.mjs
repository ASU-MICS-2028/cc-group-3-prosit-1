import { HttpError, readJson } from '../http.mjs'
import { requireAuth } from '../security.mjs'
import { accraDay } from '../time.mjs'

const CROPS = ['maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain']
const CURRENCY = { GH: 'GHS', NG: 'NGN', KE: 'KES' }
const EDITORS = ['admin', 'coordinator']
const MAX_PRICE = 1_000_000
const WEEK_MS = 7 * 24 * 3600 * 1000
const DATE = /^\d{4}-\d{2}-\d{2}$/

const invalid = (field, message) => new HttpError(400, 'invalid_request', message, { field })

function text(value, field, max) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed.length > max) throw invalid(field, `${field} must be 1 to ${max} characters`)
  return trimmed
}

/** See docs/CONTENT-CONTRACT.md: admin-entered market prices and advice cards. */
export function contentRoutes({ store, config }) {
  store.marketPrices ??= []
  store.adviceCards ??= []

  return [
    ['GET', '/market-prices', async ({ req, query }) => {
      await requireAuth(req)
      const country = query.get('country')
      if (!CURRENCY[country]) throw invalid('country', 'country must be GH, NG or KE')
      const forCountry = store.marketPrices.filter((p) => p.country === country)
      const items = CROPS.flatMap((crop) => {
        const history = forCountry.filter((p) => p.crop === crop).sort((a, b) => b.recordedOn.localeCompare(a.recordedOn))
        const [latest] = history
        if (!latest) return []
        const weekBefore = history.find((p) => Date.parse(latest.recordedOn) - Date.parse(p.recordedOn) >= WEEK_MS)
        const change = weekBefore ? Math.round(((latest.price - weekBefore.price) / weekBefore.price) * 100) : 0
        return [{ crop, price: latest.price, change, recordedOn: latest.recordedOn }]
      })
      const updatedOn = items.reduce((newest, item) => (item.recordedOn > newest ? item.recordedOn : newest), '') || null
      return [200, { country, currency: CURRENCY[country], updatedOn, items }]
    }],

    ['POST', '/admin/market-prices', async ({ req }) => {
      await requireAuth(req, EDITORS)
      const body = await readJson(req)
      if (!CURRENCY[body.country]) throw invalid('country', 'country must be GH, NG or KE')
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      if (!(typeof body.pricePerKg === 'number' && body.pricePerKg > 0 && body.pricePerKg <= MAX_PRICE)) throw invalid('pricePerKg', `The price must be more than 0 and at most ${MAX_PRICE}.`)
      const today = accraDay(new Date(config.now()).toISOString())
      const recordedOn = body.recordedOn ?? today
      if (!DATE.test(recordedOn) || recordedOn > today) throw invalid('recordedOn', 'recordedOn must be a date like 2026-10-07, not in the future')

      const price = Math.round(body.pricePerKg * 100) / 100
      const existing = store.marketPrices.find((p) => p.country === body.country && p.crop === body.crop && p.recordedOn === recordedOn)
      if (existing) existing.price = price
      else store.marketPrices.push({ country: body.country, crop: body.crop, price, recordedOn })
      return [existing ? 200 : 201, { country: body.country, crop: body.crop, price, recordedOn }]
    }],

    ['GET', '/advice', async ({ req }) => {
      await requireAuth(req)
      const items = store.adviceCards
        .filter((card) => !card.archived)
        .sort((a, b) => b.seq - a.seq)
        .map(({ id, crop, title, body, createdAt, byName }) => ({ id, crop, title, body, createdAt, byName }))
      return [200, { items }]
    }],

    ['POST', '/admin/advice', async ({ req }) => {
      const claims = await requireAuth(req, EDITORS)
      const body = await readJson(req)
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      const card = {
        seq: (store.counters.advice = (store.counters.advice ?? 0) + 1),
        crop: body.crop,
        title: text(body.title, 'title', 80),
        body: text(body.body, 'body', 500),
        archived: false,
        createdAt: new Date(config.now()).toISOString(),
        byName: claims.name ?? '',
      }
      card.id = `AD-${card.seq}`
      store.adviceCards.push(card)
      return [201, { id: card.id }]
    }],

    ['POST', '/admin/advice/:id/archive', async ({ req, params }) => {
      await requireAuth(req, EDITORS)
      const card = store.adviceCards.find((c) => c.id === params.id)
      if (!card) throw new HttpError(404, 'not_found', 'Unknown advice card')
      card.archived = true
      return [200, { id: card.id, archived: true }]
    }],
  ]
}
