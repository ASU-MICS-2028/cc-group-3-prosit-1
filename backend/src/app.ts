import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import type { Ctx } from './context.js'
import { errorHandler } from './http.js'
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

/** One line per request to stdout (CloudWatch Logs). Never bodies: they hold phone numbers and PINs. */
function requestLog(req: Request, res: Response, next: NextFunction) {
  const started = performance.now()
  res.on('finish', () => {
    if (req.path === '/health') return
    console.log(`${req.method} ${req.path} -> ${res.statusCode} ${Math.round(performance.now() - started)}ms`)
  })
  next()
}

export function createApp(ctx: Ctx): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  app.use(requestLog)
  app.use(cors(ctx.settings.pwaOrigins))
  // Webhooks are verified against their raw bytes, so they must not be parsed as JSON here.
  const json = express.json({ limit: '100kb' })
  app.use((req, res, next) => (req.path.startsWith('/webhooks/') ? next() : json(req, res, next)))

  app.get('/', (_req, res) => void res.json({ service: 'agroconnect-api', status: 'ok' }))
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
