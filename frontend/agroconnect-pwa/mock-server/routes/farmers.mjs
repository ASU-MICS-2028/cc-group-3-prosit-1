import { HttpError, readBuffer, readJson } from '../http.mjs'
import { requireAuth } from '../security.mjs'
import { normalisePhone } from '../store.mjs'

const STAFF = ['agent', 'coordinator']
const MAX_PHOTO_BYTES = 500 * 1024

export function farmerRoutes({ store }) {
  const all = () => [...store.farmers.values()]

  return [
    ['GET', '/health', async () => [200, { status: 'ok' }]],

    ['POST', '/farmers', async ({ req }) => {
      const claims = await requireAuth(req, STAFF)
      const body = await readJson(req)
      const phone = normalisePhone(body.phone)
      if (!body.name || !body.clientId || !body.phone) {
        throw new HttpError(400, 'invalid_request', 'name, phone and clientId are required')
      }

      const sameClientId = all().find((f) => f.clientId === body.clientId)
      if (sameClientId) return [200, { id: sameClientId.id }]
      if (phone && all().some((f) => normalisePhone(f.phone) === phone)) {
        throw new HttpError(409, 'duplicate_phone', 'A farmer with this phone number is already registered')
      }

      const id = String(store.counters.serverId++)
      store.farmers.set(id, { ...body, id, registeredBy: claims.sub, photoBytes: 0 })
      return [201, { id }]
    }],

    ['GET', '/farmers/me', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const phone = store.users.get(claims.sub)?.phone
      const farmer = all().find((f) => normalisePhone(f.phone) === phone)
      if (!farmer) throw new HttpError(404, 'not_found', 'No agent has registered you yet')
      return [200, farmer]
    }],

    ['POST', '/farmers/:id/photo', async ({ req, params }) => {
      await requireAuth(req, STAFF)
      const farmer = store.farmers.get(params.id)
      if (!farmer) throw new HttpError(404, 'not_found', 'Unknown farmer')
      const photo = await readBuffer(req)
      if (photo.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'too_large', 'Photo is too large')
      farmer.photoBytes = photo.length
      return [200, { bytes: photo.length }]
    }],

    ['GET', '/farmers/:id', async ({ req, params }) => {
      await requireAuth(req, [...STAFF, 'admin'])
      const farmer = store.farmers.get(params.id)
      if (!farmer) throw new HttpError(404, 'not_found', 'Unknown farmer')
      return [200, farmer]
    }],
  ]
}
