import { HttpError, readJson } from '../http.mjs'
import { requireAuth } from '../security.mjs'

const TOPICS = ['advice', 'inputs', 'pests', 'market', 'training', 'credit', 'records', 'follow_up']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const invalid = (field, message) => new HttpError(400, 'invalid_request', message, { field })

/** Extension visits (API-CONTRACT "Extension visits"), same rules as backend/src/routes/farmers.ts. */
export function visitRoutes({ store, config }) {
  store.visits ??= []
  store.counters.visit ??= 0

  /** An agent sees farmers they registered, a coordinator their association's, an admin all; else 404. */
  function visibleFarmer(claims, id) {
    const farmer = store.farmers.get(id)
    const registrar = farmer && store.users.get(farmer.registeredBy)
    const allowed = farmer && (claims.role === 'admin' || (claims.role === 'agent' && farmer.registeredBy === claims.sub) || (claims.role === 'coordinator' && registrar?.assoc === claims.assoc))
    if (!allowed) throw new HttpError(404, 'not_found', 'Unknown farmer')
    return farmer
  }

  return [
    ['POST', '/farmers/:id/visits', async ({ req, params }) => {
      const claims = await requireAuth(req, ['agent', 'coordinator'])
      const farmer = visibleFarmer(claims, params.id)
      const v = await readJson(req)
      if (!v.clientId) throw invalid('clientId', 'clientId is required')
      const topics = Array.isArray(v.topics) ? v.topics : []
      if (topics.length === 0 || !topics.every((topic) => TOPICS.includes(topic))) throw invalid('topics', `topics must be a non-empty list from: ${TOPICS.join(', ')}`)
      const notes = String(v.notes ?? '').trim()
      if (notes.length > 500) throw invalid('notes', 'notes must be at most 500 characters')
      if (v.nextVisit !== null && v.nextVisit !== undefined && !(typeof v.nextVisit === 'string' && DATE.test(v.nextVisit))) throw invalid('nextVisit', 'nextVisit must be a date like 2026-10-20')

      const existing = store.visits.find((visit) => visit.clientId === v.clientId)
      if (existing) {
        if (existing.agentId !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        return [200, { id: existing.id }]
      }
      const visit = {
        id: `EV-${++store.counters.visit}`,
        clientId: v.clientId,
        farmerId: farmer.id,
        agentId: claims.sub,
        visitedAt: v.visitedAt && !Number.isNaN(Date.parse(v.visitedAt)) ? new Date(v.visitedAt).toISOString() : new Date(config.now()).toISOString(),
        topics: [...new Set(topics)],
        notes,
        nextVisit: v.nextVisit ?? null,
      }
      store.visits.push(visit)
      return [201, { id: visit.id }]
    }],

    ['GET', '/farmers/:id/visits', async ({ req, params }) => {
      const claims = await requireAuth(req, ['agent', 'coordinator', 'admin'])
      const farmer = visibleFarmer(claims, params.id)
      const items = store.visits
        .filter((visit) => visit.farmerId === farmer.id)
        .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
        .map(({ agentId, ...visit }) => ({ ...visit, agentName: store.users.get(agentId)?.name ?? null }))
      return [200, { items }]
    }],
  ]
}
