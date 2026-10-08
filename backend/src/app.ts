import { randomUUID } from 'node:crypto'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
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
import { ussdRoutes } from './routes/ussd.js'

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

/** The sign-in / sign-up routes get a stricter per-IP limit than the rest of the API. */
const AUTH_PATHS = ['/auth/farmer/start', '/auth/farmer/verify-otp', '/auth/farmer/login', '/auth/staff/signup', '/auth/staff/verify-phone', '/auth/staff/login']

function ipLimiter({ windowMs, limit }: { windowMs: number; limit: number }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The ALB is the only proxy in front of the app (trust proxy is on), so the X-Forwarded-For check is safe.
    validate: { trustProxy: false },
    // USSD traffic all arrives from the gateway's few IPs, so a per-IP limit would throttle every farmer at
    // once; that route checks the gateway's userID instead.
    skip: (req) => req.path === '/health' || req.path === '/ready' || req.path === '/ussd',
    handler: (_req, res) => void res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Try again later.' }),
  })
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
  const limits = ctx.settings.rateLimit
  app.use(ipLimiter({ windowMs: limits.windowMs, limit: limits.max }))
  app.use(AUTH_PATHS, ipLimiter({ windowMs: limits.windowMs, limit: limits.authMax }))
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
  ussdRoutes(app, ctx)

  app.use((_req, res) => void res.status(404).json({ error: 'not_found', message: 'Not found' }))
  app.use(errorHandler)
  return app
}
