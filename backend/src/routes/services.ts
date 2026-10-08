import type { Express } from 'express'
import { actorOf, CROPS, CURRENCIES, nowDate, type Ctx } from '../context.js'
import { iso, num, pgError, type Row } from '../db.js'
import { HttpError, invalid, jsonBody, notFound, route } from '../http.js'
import { isUuid, requireAuth, type Claims } from '../security.js'
import { pageParams, totalOf } from '../pagination.js'
import { isJpeg, rawPhoto } from './farmers.js'

const FIELD_STAFF = ['agent', 'coordinator'] as const
const MAX_TEXT_LENGTH = 500
const MAX_QUANTITY_KG = 100_000
const MAX_MESSAGE_LENGTH = 1000

function text(value: unknown, field: string, required = true): string {
  const trimmed = String(value ?? '').trim()
  if (required && !trimmed) throw invalid(field, `${field} is required`)
  if (trimmed.length > MAX_TEXT_LENGTH) throw invalid(field, `${field} must be at most ${MAX_TEXT_LENGTH} characters`)
  return trimmed
}

function requireClientId(value: unknown): string {
  if (!value) throw invalid('clientId', 'clientId is required')
  if (!isUuid(value)) throw invalid('clientId', 'clientId must be a UUID')
  return String(value)
}

/**
 * A crop check with the farmer's display name (the name on the record an agent made, else the account's)
 * and their area: the association of the agent who registered them, or null if no agent has yet.
 */
const CHECK_SELECT = `
  SELECT c.*, u.phone_e164 AS farmer_phone, coalesce(nullif(f.name, ''), u.name, '') AS farmer_name,
         reg.association_id AS area
    FROM crop_checks c
    JOIN users u ON u.id = c.farmer_user_id
    LEFT JOIN farmers f ON f.phone_e164 = u.phone_e164
    LEFT JOIN users reg ON reg.id = f.created_by`

export function cropCheckTools() {
  /**
   * Admins see every crop check. An agent or coordinator sees those from their association's farmers, plus
   * any from a farmer no agent has registered yet, so nobody's question goes unanswered.
   */
  function canSee(claims: Claims, check: Row): boolean {
    if (claims.role === 'admin') return true
    if (!(FIELD_STAFF as readonly string[]).includes(claims.role)) return false
    return check.area === null || check.area === claims.assoc
  }

  const view = (check: Row) => ({
    id: check.id,
    clientId: check.client_id,
    crop: check.crop,
    note: check.note,
    status: check.status,
    createdAt: iso(check.created_at),
    farmerName: check.farmer_name,
    farmerPhone: check.farmer_phone,
    hasPhoto: check.photo_object_key !== null,
    advice: check.advice_text === null ? null : { text: check.advice_text, by: check.advice_by, at: iso(check.advice_at) },
  })

  return { canSee, view }
}

export function serviceRoutes(app: Express, ctx: Ctx): void {
  const { db, signer } = ctx
  const checks = cropCheckTools()

  async function checkFor(claims: Claims, id: string): Promise<Row> {
    const check = (await db.query(`${CHECK_SELECT} WHERE c.id = $1`, [id])).rows[0]
    const allowed = check && (claims.role === 'farmer' ? check.farmer_user_id === claims.sub : checks.canSee(claims, check))
    if (!check || !allowed) throw notFound('crop check')
    return check
  }

  /** The row a repeated clientId points at; 409 if it belongs to another account. */
  async function existingByClientId(table: string, ownerColumn: string, clientId: string, claims: Claims) {
    const existing = (await db.query(`SELECT * FROM ${table} WHERE client_id = $1`, [clientId])).rows[0] as Row
    if (existing[ownerColumn] !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
    return existing
  }

  // Crop checks (ADVICE-CONTRACT) -----------------------------------------------------------------

  app.post(
    '/crop-checks',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const body = jsonBody(req)
      const clientId = requireClientId(body.clientId)
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      const note = text(body.note, 'note')
      try {
        const { rows } = await db.tx(actorOf(claims), (q) =>
          q.query(
            `INSERT INTO crop_checks (client_id, farmer_user_id, crop, note, created_at, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $2, $2) RETURNING id, status`,
            [clientId, claims.sub, body.crop, note, nowDate(ctx)],
          ),
        )
        return [201, rows[0]]
      } catch (error) {
        if (pgError(error)?.constraint !== 'crop_checks_client_id_key') throw error
        const existing = await existingByClientId('crop_checks', 'farmer_user_id', clientId, claims)
        return [200, { id: existing.id, status: existing.status }]
      }
    }),
  )

  app.post(
    '/crop-checks/:id/photo',
    rawPhoto,
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const check = (await db.query('SELECT id, farmer_user_id FROM crop_checks WHERE id = $1', [params.id])).rows[0]
      if (!check || check.farmer_user_id !== claims.sub) throw notFound('crop check')
      const photo: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      if (photo.length === 0) throw invalid('photo', 'Send the photo as the request body')
      if (!isJpeg(photo)) throw new HttpError(415, 'unsupported_media_type', 'Photos must be JPEG')
      const key = `crop-checks/${check.id}/photo.jpg`
      await ctx.storage.put(key, photo, 'image/jpeg')
      await db.tx(actorOf(claims), (q) => q.query('UPDATE crop_checks SET photo_object_key = $2 WHERE id = $1', [check.id, key]))
      return [200, { bytes: photo.length }]
    }),
  )

  app.get(
    '/crop-checks/me',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const { limit, offset } = pageParams(query)
      const { rows } = await db.query(`${CHECK_SELECT} WHERE c.farmer_user_id = $1 ORDER BY c.seq DESC LIMIT $2 OFFSET $3`, [claims.sub, limit, offset])
      const total = Number((await db.query('SELECT count(*)::int AS n FROM crop_checks WHERE farmer_user_id = $1', [claims.sub])).rows[0]?.n ?? 0)
      return [200, { items: rows.map(checks.view), total }]
    }),
  )

  app.get(
    '/crop-checks',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, [...FIELD_STAFF, 'admin'])
      const status = query.get('status')
      if (status && !['open', 'answered'].includes(status)) throw invalid('status', 'status must be open or answered')
      const { limit, offset } = pageParams(query)
      const { rows } = await db.query(`${CHECK_SELECT} WHERE ($1::text IS NULL OR c.status = $1) ORDER BY c.seq DESC`, [status])
      const visible = rows.filter((check) => checks.canSee(claims, check))
      return [200, { items: visible.slice(offset, offset + limit).map(checks.view), total: visible.length }]
    }),
  )

  app.get(
    '/crop-checks/:id/photo',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, ['farmer', ...FIELD_STAFF, 'admin'])
      const check = await checkFor(claims, String(params.id))
      const photo = check.photo_object_key ? await ctx.storage.get(check.photo_object_key) : null
      if (!photo) throw notFound('photo')
      return [200, photo, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }]
    }),
  )

  app.post(
    '/crop-checks/:id/advice',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, [...FIELD_STAFF, 'admin'])
      const check = await checkFor(claims, String(params.id))
      const advice = text(jsonBody(req).text, 'text')
      // The status test in the WHERE makes two officers answering at once safe: only one update wins.
      const { rows } = await db.tx(actorOf(claims), (q) =>
        q.query(
          `UPDATE crop_checks SET status = 'answered', advice_text = $2, advice_by = $3, advice_by_user = $4, advice_at = $5
            WHERE id = $1 AND status = 'open' RETURNING id`,
          [check.id, advice, claims.name, claims.sub, nowDate(ctx)],
        ),
      )
      if (rows.length === 0) throw new HttpError(409, 'already_answered', 'This crop check already has advice')
      return [200, checks.view(await checkFor(claims, String(check.id)))]
    }),
  )

  // Listings (LISTINGS-CONTRACT) -------------------------------------------------------------------

  app.post(
    '/listings',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const body = jsonBody(req)
      const clientId = requireClientId(body.clientId)
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      if (!(typeof body.quantityKg === 'number' && body.quantityKg > 0 && body.quantityKg <= MAX_QUANTITY_KG)) {
        throw invalid('quantityKg', `The quantity must be more than 0 and at most ${MAX_QUANTITY_KG} kg.`)
      }
      if (!(typeof body.pricePerKg === 'number' && body.pricePerKg > 0)) throw invalid('pricePerKg', 'The price must be more than 0.')
      if (!CURRENCIES.includes(body.currency)) throw invalid('currency', 'currency must be GHS, NGN or KES')
      const community = text(body.community, 'community', false)
      try {
        const { rows } = await db.tx(actorOf(claims), (q) =>
          q.query(
            `INSERT INTO listings (client_id, seller_user_id, crop, quantity_kg, price_per_kg, currency, community, created_at, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2, $2) RETURNING id, status`,
            [clientId, claims.sub, body.crop, body.quantityKg, body.pricePerKg, body.currency, community, nowDate(ctx)],
          ),
        )
        return [201, rows[0]]
      } catch (error) {
        if (pgError(error)?.constraint !== 'listings_client_id_key') throw error
        const existing = await existingByClientId('listings', 'seller_user_id', clientId, claims)
        return [200, { id: existing.id, status: existing.status }]
      }
    }),
  )

  app.get(
    '/listings',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req)
      const crop = query.get('crop')
      if (crop && !CROPS.includes(crop)) throw invalid('crop', 'Choose one of the listed crops')
      const { limit, offset } = pageParams(query)
      const { rows } = await db.query(
        `SELECT l.*, u.phone_e164 AS seller_phone, coalesce(nullif(f.name, ''), u.name, '') AS seller_name, count(*) OVER() AS total
           FROM listings l JOIN users u ON u.id = l.seller_user_id LEFT JOIN farmers f ON f.phone_e164 = u.phone_e164
          WHERE l.status = 'open' AND ($1::text IS NULL OR l.crop = $1)
          ORDER BY l.seq DESC LIMIT $2 OFFSET $3`,
        [crop, limit, offset],
      )
      const items = rows.map((listing) => ({
        id: listing.id,
        crop: listing.crop,
        quantityKg: num(listing.quantity_kg),
        pricePerKg: num(listing.price_per_kg),
        currency: listing.currency,
        community: listing.community,
        createdAt: iso(listing.created_at),
        sellerName: listing.seller_name,
        sellerPhone: listing.seller_phone,
        mine: listing.seller_user_id === claims.sub,
      }))
      return [200, { items, total: totalOf(rows) }]
    }),
  )

  app.post(
    '/listings/:id/close',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const { rows } = await db.tx(actorOf(claims), (q) =>
        q.query("UPDATE listings SET status = 'closed' WHERE id = $1 AND seller_user_id = $2 RETURNING id, status", [params.id, claims.sub]),
      )
      if (rows.length === 0) throw notFound('listing')
      return [200, rows[0]]
    }),
  )

  // Feedback and the admin inbox (ADMIN-CONTRACT) -------------------------------------------------

  app.post(
    '/feedback',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req)
      const body = jsonBody(req)
      const message = String(body.message ?? '').trim()
      const rating = body.rating ?? null
      const clientId = requireClientId(body.clientId)
      if (!message || message.length > MAX_MESSAGE_LENGTH) throw invalid('message', `Write a message of up to ${MAX_MESSAGE_LENGTH} characters.`)
      if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw invalid('rating', 'rating must be 1 to 5, or null')
      try {
        // In a transaction with the actor set, so the feedback audit trigger records who sent it.
        const { rows } = await db.tx(actorOf(claims), (q) =>
          q.query(
            `INSERT INTO feedback (client_id, user_id, role, name, screen, message, rating, app_language, created_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2) RETURNING id`,
            [clientId, claims.sub, claims.role, claims.name ?? '', String(body.screen ?? ''), message, rating, String(body.appLanguage ?? ''), nowDate(ctx)],
          ),
        )
        return [201, rows[0]]
      } catch (error) {
        if (pgError(error)?.constraint !== 'feedback_client_id_key') throw error
        const existing = await existingByClientId('feedback', 'user_id', clientId, claims)
        return [200, { id: existing.id }]
      }
    }),
  )

  app.get(
    '/admin/activity',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, ['admin'])
      const type = query.get('type')
      if (type !== 'feedback' && type !== 'cropcheck') throw invalid('type', 'type must be feedback or cropcheck')
      const { limit, offset } = pageParams(query)
      if (type === 'cropcheck') {
        const { rows } = await db.query(`${CHECK_SELECT} ORDER BY c.seq DESC`)
        const visible = rows.filter((check) => checks.canSee(claims, check))
        return [200, { items: visible.slice(offset, offset + limit).map(checks.view), total: visible.length }]
      }
      const { rows } = await db.query('SELECT *, count(*) OVER() AS total FROM feedback ORDER BY seq DESC LIMIT $1 OFFSET $2', [limit, offset])
      const items = rows.map((entry) => ({ id: entry.id, at: iso(entry.created_at), name: entry.name, role: entry.role, screen: entry.screen, message: entry.message, rating: entry.rating }))
      return [200, { items, total: totalOf(rows) }]
    }),
  )
}
