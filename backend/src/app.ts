import { randomUUID } from 'node:crypto'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import type { Ctx } from './context.js'
import { errorHandler } from './http.js'
import { logger } from './logging.js'
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

/** Give every request an id (ours, or the caller's) and hand it back, so logs and errors can be correlated. */
function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.get('x-request-id') || randomUUID()
  ;(req as Request & { id: string }).id = id
  res.set('X-Request-Id', id)
  next()
}

export function createApp(ctx: Ctx): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  app.use(requestId)
  // One structured line per request (CloudWatch Logs). Bodies are never logged: they hold phone numbers and PINs.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request & { id?: string }).id ?? randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  )
  // The PWA calls this API cross-origin, so keep the resource policy open; there is no HTML to protect.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(cors(ctx.settings.pwaOrigins))
  // Webhooks are verified against their raw bytes, so they must not be parsed as JSON here.
  const json = express.json({ limit: '100kb' })
  app.use((req, res, next) => (req.path.startsWith('/webhooks/') ? next() : json(req, res, next)))

  app.get('/', (_req, res) => void res.json({ service: 'agroconnect-api', status: 'ok' }))
  // Liveness: the process is up (the ALB target group checks it). Readiness: the database answers too.
  app.get('/ready', async (_req, res) => {
    try {
      await ctx.db.query('SELECT 1')
      res.json({ status: 'ready' })
    } catch (error) {
      logger.error({ err: error }, 'readiness check failed')
      res.status(503).json({ status: 'unavailable' })
    }
  })
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
