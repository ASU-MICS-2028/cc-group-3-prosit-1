import { HttpError } from '../http.mjs'
import { requireAuth } from '../security.mjs'

/**
 * Follow-up requests from feature-phone farmers (USSD-CONTRACT.md). The mock has no USSD gateway, so its
 * store starts with one example request to show the screen; the real API fills it from POST /ussd.
 */
export function requestRoutes({ store, config }) {
  store.supportRequests ??= [
    { id: 'RQ-1', phone: '+233249998886', channel: 'ussd', kind: 'agent_visit', language: 'tw', status: 'open', createdAt: new Date(config.now()).toISOString(), farmer: null, handledBy: null, handledAt: null },
  ]
  return [
    ['GET', '/admin/requests', async ({ req, query }) => {
      await requireAuth(req, ['admin', 'coordinator'])
      const status = query.get('status')
      if (status && !['open', 'done'].includes(status)) throw new HttpError(400, 'invalid_request', 'status must be open or done', { field: 'status' })
      return [200, { items: store.supportRequests.filter((r) => !status || r.status === status).slice().reverse() }]
    }],
    ['POST', '/admin/requests/:id/done', async ({ req, params }) => {
      const claims = await requireAuth(req, ['admin', 'coordinator'])
      const request = store.supportRequests.find((r) => r.id === params.id)
      if (!request) throw new HttpError(404, 'not_found', 'Unknown request')
      Object.assign(request, { status: 'done', handledBy: claims.name, handledAt: new Date(config.now()).toISOString() })
      return [200, request]
    }],
  ]
}
