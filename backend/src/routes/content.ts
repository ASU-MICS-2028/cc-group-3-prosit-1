import type { Express } from 'express'
import { actorOf, CROPS, nowDate, nowIso, type Ctx } from '../context.js'
import { iso, num } from '../db.js'
import { HttpError, invalid, jsonBody, route } from '../http.js'
import { requireAuth } from '../security.js'
import { accraDay } from '../time.js'
import { notifyFarmers } from '../push.js'

const CURRENCY: Record<string, string> = { GH: 'GHS', NG: 'NGN', KE: 'KES' }
const EDITORS = ['admin', 'coordinator'] as const
const MAX_PRICE = 1_000_000
const DATE = /^\d{4}-\d{2}-\d{2}$/

function text(value: unknown, field: string, max: number): string {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed.length > max) throw invalid(field, `${field} must be 1 to ${max} characters`)
  return trimmed
}

const dayOf = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))

/** CONTENT-CONTRACT.md: market prices and advice cards that admins and coordinators enter. */
export function contentRoutes(app: Express, ctx: Ctx): void {
  const { db, signer } = ctx

  app.get(
    '/market-prices',
    route(async ({ req, query }) => {
      await requireAuth(signer, req)
      const country = query.get('country') ?? ''
      if (!CURRENCY[country]) throw invalid('country', 'country must be GH, NG or KE')
      // Latest price per crop, and the latest one recorded at least 7 days before it.
      const { rows } = await db.query(
        `SELECT DISTINCT ON (latest.crop) latest.crop, latest.price_per_kg, latest.recorded_on, earlier.price_per_kg AS earlier_price
           FROM market_prices latest
           LEFT JOIN LATERAL (
             SELECT price_per_kg FROM market_prices e
              WHERE e.country = latest.country AND e.crop = latest.crop AND e.recorded_on <= latest.recorded_on - 7
              ORDER BY e.recorded_on DESC LIMIT 1
           ) earlier ON true
          WHERE latest.country = $1
          ORDER BY latest.crop, latest.recorded_on DESC`,
        [country],
      )
      const byCrop = new Map(rows.map((row) => [row.crop as string, row]))
      const items = CROPS.flatMap((crop) => {
        const row = byCrop.get(crop)
        if (!row) return []
        const price = num(row.price_per_kg) as number
        const earlier = num(row.earlier_price)
        return [{ crop, price, change: earlier ? Math.round(((price - earlier) / earlier) * 100) : 0, recordedOn: dayOf(row.recorded_on) }]
      })
      const updatedOn = items.reduce((newest, item) => (item.recordedOn > newest ? item.recordedOn : newest), '') || null
      return [200, { country, currency: CURRENCY[country], updatedOn, items }]
    }),
  )

  app.post(
    '/admin/market-prices',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, EDITORS)
      const body = jsonBody(req)
      const currency = CURRENCY[body.country]
      if (!currency) throw invalid('country', 'country must be GH, NG or KE')
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      if (!(typeof body.pricePerKg === 'number' && body.pricePerKg > 0 && body.pricePerKg <= MAX_PRICE)) {
        throw invalid('pricePerKg', `The price must be more than 0 and at most ${MAX_PRICE}.`)
      }
      const today = accraDay(nowIso(ctx))
      const recordedOn = body.recordedOn ?? today
      if (typeof recordedOn !== 'string' || !DATE.test(recordedOn) || recordedOn > today) {
        throw invalid('recordedOn', 'recordedOn must be a date like 2026-10-07, not in the future')
      }
      const price = Math.round(body.pricePerKg * 100) / 100
      // xmax = 0 only for a freshly inserted row, so it tells a new day (201) from a replaced price (200).
      const { rows } = await db.tx(actorOf(claims), (q) =>
        q.query(
          `INSERT INTO market_prices (country, crop, price_per_kg, currency, recorded_on, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT ON CONSTRAINT market_prices_day_key DO UPDATE SET price_per_kg = EXCLUDED.price_per_kg
           RETURNING (xmax = 0) AS inserted`,
          [body.country, body.crop, price, currency, recordedOn, claims.sub],
        ),
      )
      return [rows[0]?.inserted ? 201 : 200, { country: body.country, crop: body.crop, price, recordedOn }]
    }),
  )

  app.get(
    '/advice',
    route(async ({ req }) => {
      await requireAuth(signer, req)
      const { rows } = await db.query('SELECT * FROM advice_cards WHERE NOT archived ORDER BY seq DESC')
      const items = rows.map((card) => ({ id: card.id, crop: card.crop, title: card.title, body: card.body, createdAt: iso(card.created_at), byName: card.by_name }))
      return [200, { items }]
    }),
  )

  app.post(
    '/admin/advice',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, EDITORS)
      const body = jsonBody(req)
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      const title = text(body.title, 'title', 80)
      const cardBody = text(body.body, 'body', 500)
      const { rows } = await db.tx(actorOf(claims), (q) =>
        q.query(
          `INSERT INTO advice_cards (crop, title, body, by_name, created_at, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
          [body.crop, title, cardBody, claims.name ?? '', nowDate(ctx), claims.sub],
        ),
      )
      void notifyFarmers(ctx, 'newAdvice', { title }, '/?tab=advice')
      return [201, rows[0]]
    }),
  )

  app.post(
    '/admin/advice/:id/archive',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, EDITORS)
      const { rows } = await db.tx(actorOf(claims), (q) => q.query('UPDATE advice_cards SET archived = true WHERE id = $1 RETURNING id', [params.id]))
      if (rows.length === 0) throw new HttpError(404, 'not_found', 'Unknown advice card')
      return [200, { id: rows[0]?.id, archived: true }]
    }),
  )

}
