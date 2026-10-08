import { createApp } from './app.js'
import { loadConfig, validateConfig } from './config.js'
import { DEFAULT_SETTINGS } from './context.js'
import { createPgDb } from './db.js'
import { smsGateway, memoryStorage, s3Storage, votexProvider } from './integrations.js'
import { logger } from './logging.js'
import { migrate } from './migrate.js'
import { optionalSecret } from './secrets.js'
import { createSigner } from './security.js'
import { seedAdmin, seedDemoAccounts, type AdminSeed } from './seed.js'
import { webPushSender, type VapidKeys } from './push.js'

const config = loadConfig()
// Fail fast: a missing database setting should stop the boot, not surface as a 500 later.
validateConfig(config)
const db = await createPgDb(config)

// Schema first: every instance runs this, and the advisory lock lets only one apply each migration.
const applied = await migrate(db)
if (applied.length > 0) logger.info({ migrations: applied }, 'applied migrations')

const adminSeed = await optionalSecret<AdminSeed>(config, config.adminSeedSecretArn)
if (adminSeed) await seedAdmin(db, adminSeed)
if (config.seedDemoAccounts) {
  await seedDemoAccounts(db)
  logger.warn('demo accounts with public passwords are enabled (SEED_DEMO_ACCOUNTS=true)')
}

if (!config.photoBucket) logger.warn('PHOTO_BUCKET not set: photos are kept in memory and lost on restart')
if (!config.jwtSecretArn) logger.warn('JWT_SECRET_ARN not set: using a throwaway signing key')
if (config.authTestMode) logger.warn('AUTH_TEST_MODE=true: sign-in codes are returned in responses')

const vapid = await optionalSecret<VapidKeys>(config, config.vapidSecretArn)
if (!vapid) logger.warn('VAPID_SECRET_ARN not set or empty: push notifications are off')

const app = createApp({
  db,
  signer: await createSigner(config),
  sms: smsGateway(config),
  storage: config.photoBucket ? s3Storage({ ...config, photoBucket: config.photoBucket }) : memoryStorage(),
  checkout: config.votexSecretArn ? votexProvider(config) : null,

  push: vapid?.public_key && vapid.private_key ? webPushSender({ ...vapid, subject: vapid.subject || 'mailto:admin@agroconnect.space' }) : null,
  settings: { ...DEFAULT_SETTINGS, testMode: config.authTestMode, pwaOrigins: config.pwaOrigins, ussdUserId: config.ussdUserId },
  now: Date.now,
})

const server = app.listen(config.port, () => logger.info({ port: config.port }, 'agroconnect-api listening'))

// The ASG replaces instances during a deploy: finish in-flight requests, then close the pool. If a
// connection refuses to drain, exit anyway after a grace period so the instance does not hang forever.
let shuttingDown = false
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down')
  const force = setTimeout(() => {
    logger.error('shutdown timed out; forcing exit')
    process.exit(1)
  }, 10_000)
  force.unref()
  server.close(() => void db.close().finally(() => {
    clearTimeout(force)
    process.exit(0)
  }))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
