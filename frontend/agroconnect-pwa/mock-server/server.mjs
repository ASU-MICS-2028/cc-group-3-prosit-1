// Stand-in for the backend services until the Data lead's versions exist. It implements the
// contracts in docs/ exactly, so it is the executable reference. Run: npm run mock
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createRouter } from './http.mjs'
import { adminRoutes } from './routes/admin.mjs'
import { authRoutes } from './routes/auth.mjs'
import { farmerRoutes } from './routes/farmers.mjs'
import { DEMO_ACCOUNTS, createStore } from './store.mjs'

const DEFAULTS = {
  testMode: true,
  otpTtlMs: 5 * 60_000,
  lockMs: 15 * 60_000,
  maxAttempts: 5,
  now: Date.now,
}

/** Builds a server with its own empty state, so each test starts clean. */
export async function createApp(options = {}) {
  const ctx = { store: await createStore(), config: { ...DEFAULTS, ...options } }
  return createServer(createRouter([...authRoutes(ctx), ...adminRoutes(ctx), ...farmerRoutes(ctx)]))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const port = Number(process.env.PORT ?? 4000)
  const testMode = process.env.AUTH_TEST_MODE !== 'false'
  const app = await createApp({ testMode })
  app.listen(port, () => {
    console.log(`Mock backend on http://localhost:${port}  (AUTH_TEST_MODE=${testMode})`)
    console.log('Demo accounts (mock only):')
    for (const [name, account] of Object.entries(DEMO_ACCOUNTS)) {
      console.log(`  ${name.padEnd(13)} ${account.loginId ?? account.phone}  /  ${account.password}`)
    }
  })
}
