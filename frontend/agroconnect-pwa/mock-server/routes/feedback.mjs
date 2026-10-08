import { HttpError, readJson } from '../http.mjs'
import { requireAuth } from '../security.mjs'
import { cropCheckTools } from './services.mjs'

const MAX_MESSAGE_LENGTH = 1000
const INBOX_TYPES = ['feedback', 'cropcheck']

export function feedbackRoutes(ctx) {
  const { store, config } = ctx
  const checks = cropCheckTools(ctx)
  return [
    ['POST', '/feedback', async ({ req }) => {
      const claims = await requireAuth(req)
      const body = await readJson(req)
      const message = String(body.message ?? '').trim()
      const rating = body.rating ?? null

      const invalid = (field, text) => new HttpError(400, 'invalid_request', text, { field })
      if (!body.clientId) throw invalid('clientId', 'clientId is required')
      if (!message || message.length > MAX_MESSAGE_LENGTH) throw invalid('message', `Write a message of up to ${MAX_MESSAGE_LENGTH} characters.`)
      if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw invalid('rating', 'rating must be 1 to 5, or null')

      const existing = [...store.feedback.values()].find((entry) => entry.clientId === body.clientId)
      if (existing) {
        if (existing.userId !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        return [200, { id: existing.id }]
      }

      const entry = {
        id: `FB-${++store.counters.feedback}`,
        clientId: body.clientId,
        userId: claims.sub,
        role: claims.role,
        name: claims.name,
        screen: String(body.screen ?? ''),
        message,
        rating,
        appLanguage: String(body.appLanguage ?? ''),
        createdAt: new Date(config.now()).toISOString(),
      }
      store.feedback.set(entry.id, entry)
      return [201, { id: entry.id }]
    }],

    ['GET', '/admin/activity', async ({ req, query }) => {
      await requireAuth(req, ['admin'])
      const type = query.get('type')
      if (!INBOX_TYPES.includes(type)) throw new HttpError(400, 'invalid_request', 'type must be feedback or cropcheck', { field: 'type' })
      if (type === 'cropcheck') return [200, { items: checks.newestFirst([...store.cropChecks.values()]).map(checks.view) }]
      const items = [...store.feedback.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ id, createdAt, name, role, screen, message, rating }) => ({ id, at: createdAt, name, role, screen, message, rating }))
      return [200, { items }]
    }],
  ]
}
