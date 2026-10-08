import { createApp } from './app.js'
import { loadConfig, validateConfig } from './config.js'
import { DEFAULT_SETTINGS } from './context.js'
import { createPgDb } from './db.js'
import { arkeselSms, memoryStorage, s3Storage, votexProvider } from './integrations.js'
import { migrate } from './migrate.js'
import { optionalSecret } from './secrets.js'
import { describeError, log } from './log.js'
import { createSigner } from './security.js'
import { seedAdmin, seedDemoAccounts, type AdminSeed } from './seed.js'

const config = loadConfig()
validateConfig(config)
const db = await createPgDb(config)

// Schema first: every instance runs this, and the advisory lock lets only one apply each migration.
const applied = await migrate(db)
if (applied.length > 0) log.info('db', 'applied migrations', { migrations: applied })

const adminSeed = await optionalSecret<AdminSeed>(config, config.adminSeedSecretArn)
if (adminSeed) await seedAdmin(db, adminSeed)
if (config.seedDemoAccounts) {
  await seedDemoAccounts(db)
  log.warn('seed', 'demo accounts with public passwords are enabled (SEED_DEMO_ACCOUNTS=true)')
}

if (!config.photoBucket) log.warn('storage', 'PHOTO_BUCKET not set: photos are kept in memory and lost on restart')
if (config.authTestMode) log.warn('auth', 'AUTH_TEST_MODE=true: sign-in codes are returned in responses')

const app = createApp({
  db,
  signer: await createSigner(config),
  sms: arkeselSms(config),
  storage: config.photoBucket ? s3Storage({ ...config, photoBucket: config.photoBucket }) : memoryStorage(),
  checkout: config.votexSecretArn ? votexProvider(config) : null,
  settings: { ...DEFAULT_SETTINGS, testMode: config.authTestMode, pwaOrigins: config.pwaOrigins },
  now: Date.now,
})

const server = app.listen(config.port, () => log.info('server', 'listening', { port: config.port }))

// The ASG replaces instances during a deploy (SIGTERM; SIGINT locally): stop taking connections, let
// in-flight requests finish, close the pool. If something hangs, exit anyway after 10 seconds.
const SHUTDOWN_TIMEOUT_MS = 10_000
let stopping = false
function shutdown(signal: string): void {
  if (stopping) return
  stopping = true
  log.info('server', 'shutting down', { signal })
  setTimeout(() => {
    log.warn('server', 'shutdown timed out; exiting')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS).unref()
  server.close(() => void db.close().finally(() => process.exit(0)))
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (error) => log.error('server', 'unhandled rejection', describeError(error)))
