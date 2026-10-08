// Stand-in for the backend services until the Data lead's versions exist. It implements the
// contracts in docs/ exactly, so it is the executable reference. Run: npm run mock
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createRouter } from './http.mjs'
import { KEYS_FILE, STATE_FILE, createSaver, readSnapshot, resetData } from './persist.mjs'
import { adminRoutes } from './routes/admin.mjs'
import { authRoutes } from './routes/auth.mjs'
import { contentRoutes } from './routes/content.mjs'
import { farmerRoutes } from './routes/farmers.mjs'
import { feedbackRoutes } from './routes/feedback.mjs'
import { paymentRoutes } from './routes/payments.mjs'
import { serviceRoutes } from './routes/services.mjs'
import { loadKeys } from './security.mjs'
import { statsRoutes } from './routes/stats.mjs'
import { DEMO_ACCOUNTS, SUGGESTED_PINS, createStore } from './store.mjs'

const DEFAULTS = {
  testMode: true,
  otpTtlMs: 5 * 60_000,
  lockMs: 15 * 60_000,
  maxAttempts: 5,
  now: Date.now,
  paymentDelayMs: 4000,
}

/**
 * Builds a server with its own state, so each test starts clean. With `dataFile` the state is loaded
 * from that file and saved back after every change, so a restart keeps farmers, approvals and accounts.
 */
export async function createApp({ dataFile, ...options } = {}) {
  const store = await createStore(dataFile ? await readSnapshot(dataFile) : null)
  const ctx = { store, config: { ...DEFAULTS, ...options } }
  const saver = dataFile ? createSaver(dataFile, store) : null
  const router = createRouter([...authRoutes(ctx), ...adminRoutes(ctx), ...farmerRoutes(ctx), ...statsRoutes(ctx), ...paymentRoutes(ctx), ...feedbackRoutes(ctx), ...serviceRoutes(ctx), ...contentRoutes(ctx)])

  const server = createServer((req, res) => {
    if (saver && req.method !== 'GET' && req.method !== 'OPTIONS') res.on('finish', saver.schedule)
    return router(req, res)
  })
  server.flush = () => saver?.flush()
  return server
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const port = Number(process.env.PORT ?? 4000)
  const testMode = process.env.AUTH_TEST_MODE !== 'false'
  const persist = !process.argv.includes('--memory')
  if (process.argv.includes('--reset')) await resetData()
  if (persist) await loadKeys(KEYS_FILE)

  const app = await createApp({ testMode, ...(persist && { dataFile: STATE_FILE }) })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await app.flush()
      process.exit(0)
    })
  }

  app.listen(port, () => {
    console.log(`Mock backend on http://localhost:${port}  (AUTH_TEST_MODE=${testMode})`)
    console.log(persist ? 'Saving data in mock-server/.mock-data (npm run mock:reset starts fresh).' : 'Keeping data in memory only.')
    console.log('Demo accounts (mock only):')
    for (const [name, account] of Object.entries(DEMO_ACCOUNTS)) {
      console.log(`  ${name.padEnd(13)} ${account.loginId ?? account.phone}  /  ${account.password ?? `PIN ${account.pin}`}`)
    }
    console.log(`Staff choose their own 6-digit PIN the first time they sign in on a phone (demo: ${SUGGESTED_PINS.staff}).`)
    console.log(`Other farmers choose a 4-digit PIN after the on-screen code (demo: ${SUGGESTED_PINS.farmer}).`)
  })
}
