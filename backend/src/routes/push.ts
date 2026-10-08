import type { Express } from 'express'
import type { Ctx } from '../context.js'
import { invalid, jsonBody, notFound, route } from '../http.js'
import { requireAuth } from '../security.js'

const BASE64URL = /^[A-Za-z0-9_-]+=*$/

/** Browsers subscribe here to Web Push (PUSH section of ADMIN-CONTRACT). Off (404) without VAPID keys. */
export function pushRoutes(app: Express, ctx: Ctx): void {
  const { db, signer } = ctx

  app.get(
    '/push/key',
    route(async () => {
      if (!ctx.push) throw notFound('push key')
      return [200, { publicKey: ctx.push.publicKey }]
    }),
  )

  app.post(
    '/push/subscriptions',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req)
      if (!ctx.push) throw notFound('push key')
      const body = jsonBody(req)
      const endpoint = String(body.endpoint ?? '')
      const { p256dh, auth } = (body.keys ?? {}) as { p256dh?: string; auth?: string }
      if (!/^https:\/\/\S{10,2000}$/.test(endpoint)) throw invalid('endpoint', 'endpoint must be the HTTPS URL the browser gave')
      if (!p256dh || !auth || !BASE64URL.test(p256dh) || !BASE64URL.test(auth)) throw invalid('keys', 'keys.p256dh and keys.auth are required')
      // An endpoint belongs to one browser; if someone else signs in on it, it moves to them.
      await db.query(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
        [endpoint, claims.sub, p256dh, auth],
      )
      return [201, { subscribed: true }]
    }),
  )

  app.post(
    '/push/subscriptions/delete',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req)
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [String(jsonBody(req).endpoint ?? ''), claims.sub])
      return [204]
    }),
  )
}
