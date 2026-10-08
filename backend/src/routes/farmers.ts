import express, { type Express } from 'express'
import { actorOf, nowDate, type Ctx } from '../context.js'
import { iso, num, pgError, type Queryable, type Row } from '../db.js'
import { HttpError, invalid, jsonBody, notFound, route } from '../http.js'
import { isUuid, requireAuth, type Claims } from '../security.js'

const STAFF = ['agent', 'coordinator'] as const
const ACRES_TO_HECTARES = 0.404686
export const MAX_PHOTO_BYTES = 500 * 1024
const COUNTRY_CODE = /^\+[1-9]\d{0,2}$/
const NATIONAL_NUMBER = /^[1-9]\d{6,13}$/
const LANGUAGES = ['en', 'tw', 'ee', 'dag']
const GENDERS = ['female', 'male', 'undisclosed']

export const rawPhoto = express.raw({ type: () => true, limit: MAX_PHOTO_BYTES })

const FARMER_SELECT = `
  SELECT f.*, coalesce(array_agg(c.crop_type ORDER BY c.crop_type) FILTER (WHERE c.crop_type IS NOT NULL), '{}') AS crops
    FROM farmers f LEFT JOIN farmer_crops c ON c.farmer_id = f.id`

/** A farmer record in the API's shape: the field names the PWA sent, plus what the server added. */
export function farmerView(row: Row) {
  return {
    id: String(row.id),
    clientId: row.client_id,
    name: row.name,
    countryCode: row.country_code,
    phoneNational: row.phone_national,
    phoneE164: row.phone_e164,
    preferredLanguage: row.language,
    gender: row.gender,
    community: row.community,
    region: row.region,
    farmSizeAcres: row.farm_size_unit === 'acres' ? num(row.farm_size_entered) : null,
    farmSizeHectares: num(row.farm_size_hectares),
    crops: row.crops ?? [],
    gps: row.gps_lat === null ? null : { lat: num(row.gps_lat), lng: num(row.gps_lng), accuracy: num(row.gps_accuracy_m), capturedAt: iso(row.gps_captured_at) },
    consent: row.consent,
    registeredAt: iso(row.registered_at),
    createdAt: iso(row.created_at),
    registeredBy: row.created_by,
    hasPhoto: row.photo_object_key !== null,
  }
}

export async function getFarmer(q: Queryable, where: string, params: unknown[]) {
  const { rows } = await q.query(`${FARMER_SELECT} WHERE ${where} GROUP BY f.id`, params)
  return rows[0]
}

export function farmerRoutes(app: Express, ctx: Ctx): void {
  const { db, signer } = ctx

  /**
   * A farmer the caller may see: an agent only the records they registered, a coordinator only their
   * association's, an admin any. Anything else looks like it does not exist (404), like the other
   * 404-for-forbidden paths.
   */
  async function visibleFarmer(claims: Claims, id: string): Promise<Row> {
    const row = await getFarmer(db, 'f.id = $1', [id])
    if (!row) throw notFound('farmer')
    if (claims.role === 'admin') return row
    if (claims.role === 'agent' && row.created_by === claims.sub) return row
    if (claims.role === 'coordinator') {
      const { rows } = await db.query('SELECT association_id FROM users WHERE id = $1', [row.created_by])
      if (rows[0]?.association_id === claims.assoc) return row
    }
    throw notFound('farmer')
  }

  app.get('/health', route(async () => [200, { status: 'ok' }]))

  /** API-CONTRACT: insert, catch the constraint, never search first. */
  app.post(
    '/farmers',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, STAFF)
      const f = jsonBody(req)
      if (!f.name || !f.clientId || !f.countryCode || !f.phoneNational) throw new HttpError(400, 'invalid_request', 'name, phone and clientId are required')
      if (!isUuid(f.clientId)) throw invalid('clientId', 'clientId must be a UUID')
      if (!COUNTRY_CODE.test(f.countryCode) || !NATIONAL_NUMBER.test(f.phoneNational)) {
        throw new HttpError(400, 'invalid_request', 'countryCode must look like +233, and phoneNational must be digits without a leading 0')
      }
      // Check the enums here so the caller gets a field to fix, rather than a raw constraint name.
      if (f.gender != null && !GENDERS.includes(f.gender)) throw invalid('gender', 'gender must be female, male or undisclosed')
      if (f.preferredLanguage != null && !LANGUAGES.includes(f.preferredLanguage)) throw invalid('preferredLanguage', 'preferredLanguage must be en, tw, ee or dag')
      const acres = typeof f.farmSizeAcres === 'number' ? f.farmSizeAcres : null
      const crops: unknown[] = Array.isArray(f.crops) ? f.crops : []
      const registeredAt = f.registeredAt ?? nowDate(ctx).toISOString()
      const consent = f.consent === true

      try {
        const id = await db.tx(actorOf(claims), async (q) => {
          const { rows } = await q.query(
            `INSERT INTO farmers
               (client_id, name, country_code, phone_national, language, gender, community, region,
                farm_size_entered, farm_size_unit, farm_size_hectares,
                gps_lat, gps_lng, gps_accuracy_m, gps_captured_at,
                consent, consent_at, registered_at, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)
             RETURNING id`,
            [
              f.clientId, String(f.name).trim(), f.countryCode, f.phoneNational, f.preferredLanguage ?? null, f.gender ?? null,
              f.community ?? null, f.region ?? null,
              acres, acres === null ? null : 'acres', acres === null ? null : acres * ACRES_TO_HECTARES,
              f.gps?.lat ?? null, f.gps?.lng ?? null, f.gps?.accuracy ?? null, f.gps?.capturedAt ?? null,
              consent, consent ? registeredAt : null, registeredAt, claims.sub,
            ],
          )
          const farmerId = rows[0]?.id
          if (crops.length > 0) {
            await q.query(
              'INSERT INTO farmer_crops (farmer_id, crop_type, created_by, updated_by) SELECT $1, unnest($2::text[]), $3, $3 ON CONFLICT DO NOTHING',
              [farmerId, crops, claims.sub],
            )
          }
          return String(farmerId)
        })
        return [201, { id }]
      } catch (error) {
        const constraint = pgError(error)?.constraint
        if (constraint === 'farmers_client_id_key') {
          const { rows } = await db.query('SELECT id FROM farmers WHERE client_id = $1', [f.clientId])
          return [200, { id: String(rows[0]?.id) }]
        }
        if (constraint === 'farmers_phone_e164_key') throw new HttpError(409, 'duplicate_phone', 'A farmer with this phone number is already registered')
        throw error
      }
    }),
  )

  /** The record an agent made for this farmer, linked by phone. */
  app.get(
    '/farmers/me',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const row = await getFarmer(db, 'f.phone_e164 = $1', [claims.phone])
      if (!row) throw new HttpError(404, 'not_found', 'No agent has registered you yet')
      return [200, farmerView(row)]
    }),
  )

  /** The photo goes through the API to S3, so the phone never holds bucket access (API-CONTRACT). */
  app.post(
    '/farmers/:id/photo',
    rawPhoto,
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, STAFF)
      if (!/^\d+$/.test(params.id ?? '')) throw notFound('farmer')
      // Only the agent who registered the farmer (or their coordinator) may attach a photo.
      await visibleFarmer(claims, params.id ?? '')
      const photo: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      if (photo.length === 0) throw invalid('photo', 'Send the photo as the request body')

      const key = `farmers/${params.id}/photo.jpg`
      await ctx.storage.put(key, photo, req.get('content-type') || 'image/jpeg')
      await db.tx(actorOf(claims), (q) =>
        q.query('UPDATE farmers SET photo_object_key = $2, photo_bytes = $3 WHERE id = $1', [params.id, key, photo.length]),
      )
      return [200, { bytes: photo.length }]
    }),
  )

  app.get(
    '/farmers/:id',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, [...STAFF, 'admin'])
      if (!/^\d+$/.test(params.id ?? '')) throw notFound('farmer')
      return [200, farmerView(await visibleFarmer(claims, params.id ?? ''))]
    }),
  )
}
