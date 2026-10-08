import { randomUUID } from 'node:crypto'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import type { Ctx } from './context.js'
import { errorHandler, route } from './http.js'
import { log } from './log.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { contentRoutes } from './routes/content.js'
import { farmerRoutes } from './routes/farmers.js'
import { paymentRoutes } from './routes/payments.js'
import { serviceRoutes } from './routes/services.js'

/** Only the hosted PWA (and local dev) may call the API from a browser, with the Authorization header. */
function cors(origins: string[]) {
  const allowed = new Set(origins)
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin')
    if (origin && allowed.has(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
      })
    }
    res.vary('Origin')
    if (req.method === 'OPTIONS') return void res.status(204).end()
    next()
  }
}

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/

/**
 * Every request gets an ID (the caller's X-Request-ID if it looks sane, else a new UUID), echoed in the
 * response and in every log line and 500 body for that request, so a report can be matched to its logs.
 */
function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id')
  res.locals.requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID()
  res.set('X-Request-ID', res.locals.requestId)
  next()
}

/** One JSON line per request (CloudWatch Logs). Never bodies: they hold phone numbers and PINs. */
function requestLog(req: Request, res: Response, next: NextFunction) {
  const started = performance.now()
  res.on('finish', () => {
    if (req.path === '/health') return
    log.info('http', 'request', {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    })
  })
  next()
}

export function createApp(ctx: Ctx): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  // Security headers. The API serves JSON, CSV and photos, never pages, so the strictest CSP fits.
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }))
  app.use(requestId)
  app.use(requestLog)
  app.use(cors(ctx.settings.pwaOrigins))
  // Webhooks are verified against their raw bytes, so they must not be parsed as JSON here.
  const json = express.json({ limit: '100kb' })
  app.use((req, res, next) => (req.path.startsWith('/webhooks/') ? next() : json(req, res, next)))

  app.get('/', (_req, res) => void res.json({ service: 'agroconnect-api', status: 'ok' }))
  // /health (liveness, polled by the ALB) never touches the database, so a database blip does not make the
  // ALB drain every instance. /ready says whether this instance can actually serve requests.
  app.get(
    '/ready',
    route(async () => {
      try {
        await ctx.db.query('SELECT 1')
        return [200, { status: 'ready' }]
      } catch {
        return [503, { status: 'not_ready', reason: 'database' }]
      }
    }),
  )
  authRoutes(app, ctx)
  farmerRoutes(app, ctx)
  adminRoutes(app, ctx)
  paymentRoutes(app, ctx)
  serviceRoutes(app, ctx)
  contentRoutes(app, ctx)

  app.use((_req, res) => void res.status(404).json({ error: 'not_found', message: 'Not found' }))
  app.use(errorHandler)
  return app
}
