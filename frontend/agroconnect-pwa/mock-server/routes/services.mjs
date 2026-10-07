import { HttpError, readBuffer, readJson } from '../http.mjs'
import { requireAuth } from '../security.mjs'

const CROPS = ['maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain']
const CURRENCIES = ['GHS', 'NGN', 'KES']
const FIELD_STAFF = ['agent', 'coordinator']
const MAX_TEXT_LENGTH = 500
const MAX_PHOTO_BYTES = 500 * 1024
const MAX_QUANTITY_KG = 100_000

const invalid = (field, message) => new HttpError(400, 'invalid_request', message, { field })
const notFound = (what) => new HttpError(404, 'not_found', `Unknown ${what}`)

function text(value, field, { required = true } = {}) {
  const trimmed = String(value ?? '').trim()
  if (required && !trimmed) throw invalid(field, `${field} is required`)
  if (trimmed.length > MAX_TEXT_LENGTH) throw invalid(field, `${field} must be at most ${MAX_TEXT_LENGTH} characters`)
  return trimmed
}

/** Who a farmer is and which association looks after them, worked out from the records an agent created. */
function people({ store }) {
  const recordFor = (user) => [...store.farmers.values()].find((farmer) => farmer.phoneE164 === user.phone)
  const displayName = (user) => recordFor(user)?.name || user.name || ''
  const areaOf = (user) => store.users.get(recordFor(user)?.registeredBy)?.assoc ?? null
  return { recordFor, displayName, areaOf }
}

export function cropCheckTools(ctx) {
  const { store } = ctx
  const { displayName, areaOf } = people(ctx)

  /**
   * Admins see every crop check. An agent or coordinator sees those from their association's farmers, plus
   * any from a farmer no agent has registered yet, so nobody's question is left unanswered.
   */
  function canSee(claims, check) {
    if (claims.role === 'admin') return true
    if (!FIELD_STAFF.includes(claims.role)) return false
    const area = areaOf(store.users.get(check.farmerId))
    return area === null || area === claims.assoc
  }

  function view(check) {
    const farmer = store.users.get(check.farmerId)
    return {
      id: check.id,
      clientId: check.clientId,
      crop: check.crop,
      note: check.note,
      status: check.status,
      createdAt: check.createdAt,
      farmerName: displayName(farmer),
      farmerPhone: farmer.phone,
      hasPhoto: Boolean(check.photoBase64),
      advice: check.advice,
    }
  }

  const newestFirst = (checks) => [...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { canSee, view, newestFirst }
}

export function serviceRoutes(ctx) {
  const { store, config } = ctx
  const checks = cropCheckTools(ctx)
  const { displayName } = people(ctx)
  const allChecks = () => [...store.cropChecks.values()]
  const now = () => new Date(config.now()).toISOString()

  function checkFor(claims, id) {
    const check = store.cropChecks.get(id)
    const allowed = check && (claims.role === 'farmer' ? check.farmerId === claims.sub : checks.canSee(claims, check))
    if (!check || !allowed) throw notFound('crop check')
    return check
  }

  return [
    ['POST', '/crop-checks', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const body = await readJson(req)
      if (!body.clientId) throw invalid('clientId', 'clientId is required')
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      const note = text(body.note, 'note')

      const existing = allChecks().find((check) => check.clientId === body.clientId)
      if (existing) {
        if (existing.farmerId !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        return [200, { id: existing.id, status: existing.status }]
      }

      const check = {
        id: `CC-${++store.counters.cropCheck}`,
        clientId: body.clientId,
        farmerId: claims.sub,
        crop: body.crop,
        note,
        status: 'open',
        createdAt: now(),
        advice: null,
        photoBase64: null,
      }
      store.cropChecks.set(check.id, check)
      return [201, { id: check.id, status: check.status }]
    }],

    ['POST', '/crop-checks/:id/photo', async ({ req, params }) => {
      const claims = await requireAuth(req, ['farmer'])
      const check = store.cropChecks.get(params.id)
      if (!check || check.farmerId !== claims.sub) throw notFound('crop check')
      const photo = await readBuffer(req)
      if (photo.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'too_large', 'Photo is too large')
      check.photoBase64 = photo.toString('base64')
      return [200, { bytes: photo.length }]
    }],

    ['GET', '/crop-checks/me', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const mine = allChecks().filter((check) => check.farmerId === claims.sub)
      return [200, { items: checks.newestFirst(mine).map(checks.view) }]
    }],

    ['GET', '/crop-checks', async ({ req, query }) => {
      const claims = await requireAuth(req, [...FIELD_STAFF, 'admin'])
      const status = query.get('status')
      if (status && !['open', 'answered'].includes(status)) throw invalid('status', 'status must be open or answered')
      const visible = allChecks().filter((check) => checks.canSee(claims, check) && (!status || check.status === status))
      return [200, { items: checks.newestFirst(visible).map(checks.view) }]
    }],

    ['GET', '/crop-checks/:id/photo', async ({ req, params }) => {
      const claims = await requireAuth(req, ['farmer', ...FIELD_STAFF, 'admin'])
      const check = checkFor(claims, params.id)
      if (!check.photoBase64) throw notFound('photo')
      return [200, Buffer.from(check.photoBase64, 'base64'), { 'Content-Type': 'image/jpeg' }]
    }],

    ['POST', '/crop-checks/:id/advice', async ({ req, params }) => {
      const claims = await requireAuth(req, [...FIELD_STAFF, 'admin'])
      const check = checkFor(claims, params.id)
      const advice = text((await readJson(req)).text, 'text')
      if (check.status === 'answered') throw new HttpError(409, 'already_answered', 'This crop check already has advice')
      check.status = 'answered'
      check.advice = { text: advice, by: claims.name, at: now() }
      return [200, checks.view(check)]
    }],

    ['POST', '/listings', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const body = await readJson(req)
      if (!body.clientId) throw invalid('clientId', 'clientId is required')
      if (!CROPS.includes(body.crop)) throw invalid('crop', 'Choose one of the listed crops')
      if (!(typeof body.quantityKg === 'number' && body.quantityKg > 0 && body.quantityKg <= MAX_QUANTITY_KG)) throw invalid('quantityKg', `The quantity must be more than 0 and at most ${MAX_QUANTITY_KG} kg.`)
      if (!(typeof body.pricePerKg === 'number' && body.pricePerKg > 0)) throw invalid('pricePerKg', 'The price must be more than 0.')
      if (!CURRENCIES.includes(body.currency)) throw invalid('currency', 'currency must be GHS, NGN or KES')

      const existing = [...store.listings.values()].find((listing) => listing.clientId === body.clientId)
      if (existing) {
        if (existing.sellerId !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        return [200, { id: existing.id, status: existing.status }]
      }

      const listing = {
        id: `LS-${++store.counters.listing}`,
        clientId: body.clientId,
        sellerId: claims.sub,
        crop: body.crop,
        quantityKg: body.quantityKg,
        pricePerKg: body.pricePerKg,
        currency: body.currency,
        community: text(body.community, 'community', { required: false }),
        status: 'open',
        createdAt: now(),
      }
      store.listings.set(listing.id, listing)
      return [201, { id: listing.id, status: listing.status }]
    }],

    ['GET', '/listings', async ({ req, query }) => {
      const claims = await requireAuth(req)
      const crop = query.get('crop')
      if (crop && !CROPS.includes(crop)) throw invalid('crop', 'Choose one of the listed crops')
      const open = [...store.listings.values()].filter((listing) => listing.status === 'open' && (!crop || listing.crop === crop))
      const items = open
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((listing) => {
          const seller = store.users.get(listing.sellerId)
          return {
            id: listing.id,
            crop: listing.crop,
            quantityKg: listing.quantityKg,
            pricePerKg: listing.pricePerKg,
            currency: listing.currency,
            community: listing.community,
            createdAt: listing.createdAt,
            sellerName: displayName(seller),
            sellerPhone: seller.phone,
            mine: listing.sellerId === claims.sub,
          }
        })
      return [200, { items }]
    }],

    ['POST', '/listings/:id/close', async ({ req, params }) => {
      const claims = await requireAuth(req, ['farmer'])
      const listing = store.listings.get(params.id)
      if (!listing || listing.sellerId !== claims.sub) throw notFound('listing')
      listing.status = 'closed'
      return [200, { id: listing.id, status: listing.status }]
    }],
  ]
}
