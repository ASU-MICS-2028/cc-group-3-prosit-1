import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { DEFAULT_SETTINGS } from './context.js'
import { createPgDb } from './db.js'
import { arkeselSms, memoryStorage, s3Storage, votexProvider } from './integrations.js'
import { migrate } from './migrate.js'
import { optionalSecret } from './secrets.js'
import { createSigner } from './security.js'
import { seedAdmin, seedDemoAccounts, type AdminSeed } from './seed.js'

const config = loadConfig()
const db = await createPgDb(config)

// Schema first: every instance runs this, and the advisory lock lets only one apply each migration.
const applied = await migrate(db)
if (applied.length > 0) console.log(`[db] applied migrations: ${applied.join(', ')}`)

const adminSeed = await optionalSecret<AdminSeed>(config, config.adminSeedSecretArn)
if (adminSeed) await seedAdmin(db, adminSeed)
if (config.seedDemoAccounts) {
  await seedDemoAccounts(db)
  console.warn('[seed] demo accounts with public passwords are enabled (SEED_DEMO_ACCOUNTS=true)')
}

if (!config.photoBucket) console.warn('[storage] PHOTO_BUCKET not set: photos are kept in memory and lost on restart')
if (config.authTestMode) console.warn('[auth] AUTH_TEST_MODE=true: sign-in codes are returned in responses')

const app = createApp({
  db,
  signer: await createSigner(config),
  sms: arkeselSms(config),
  storage: config.photoBucket ? s3Storage({ ...config, photoBucket: config.photoBucket }) : memoryStorage(),
  checkout: config.votexSecretArn ? votexProvider(config) : null,
  settings: { ...DEFAULT_SETTINGS, testMode: config.authTestMode, pwaOrigins: config.pwaOrigins },
  now: Date.now,
})

const server = app.listen(config.port, () => console.log(`agroconnect-api listening on :${config.port}`))

// The ASG replaces instances during a deploy: finish in-flight requests, then close the pool.
process.on('SIGTERM', () => {
  server.close(() => void db.close().finally(() => process.exit(0)))
})
