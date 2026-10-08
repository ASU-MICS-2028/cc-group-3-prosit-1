/** Everything the service reads from its environment. Secrets are referenced by ARN and fetched at runtime. */
export interface Config {
  port: number
  /** Local development: a full connection string. Production uses dbHost + dbSecretArn instead. */
  databaseUrl: string | null
  dbHost: string | null
  dbName: string
  /** RDS-managed master secret ({ username, password }); read per new connection so rotation just works. */
  dbSecretArn: string | null
  /** Path to the RDS CA bundle. When set, the connection verifies the server certificate. */
  dbCaFile: string | null
  region: string
  /** Browser origins allowed to call the API (CORS). */
  pwaOrigins: string[]
  /** When true, sign-in codes come back in the response and no SMS is sent. Must be false in production. */
  authTestMode: boolean
  /** Arkesel's userID for our USSD code (USSD_USER_ID). Unset: POST /ussd answers 404. */
  ussdUserId: string | null
  jwtSecretArn: string | null
  smsSecretArn: string | null
  photoBucket: string | null
  votexSecretArn: string | null
  votexBaseUrl: string
  /** Where votex365 sends the farmer's browser after checkout. */
  paymentReturnUrl: string
  adminSeedSecretArn: string | null
  /** Seeds the documented demo accounts (WALKTHROUGH.md). Their passwords are public: never on real data. */
  seedDemoAccounts: boolean
}

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const flag = (value: string | undefined, fallback: boolean) => (value === undefined ? fallback : value === 'true')

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 8000,
    databaseUrl: env.DATABASE_URL || null,
    dbHost: env.DB_HOST || null,
    dbName: env.DB_NAME || 'agroconnect',
    dbSecretArn: env.DB_SECRET_ARN || null,
    dbCaFile: env.DB_CA_FILE || null,
    region: env.AWS_REGION || 'af-south-1',
    pwaOrigins: list(env.PWA_ORIGINS ?? 'http://localhost:5173'),
    authTestMode: flag(env.AUTH_TEST_MODE, false),
    ussdUserId: env.USSD_USER_ID || null,
    jwtSecretArn: env.JWT_SECRET_ARN || null,
    smsSecretArn: env.SMS_SECRET_ARN || null,
    photoBucket: env.PHOTO_BUCKET || null,
    votexSecretArn: env.VOTEX_SECRET_ARN || null,
    votexBaseUrl: env.VOTEX_BASE_URL || 'https://utilities.votex365.com/api/v1/partner',
    paymentReturnUrl: env.PAYMENT_RETURN_URL || 'http://localhost:5173/',
    adminSeedSecretArn: env.ADMIN_SEED_SECRET_ARN || null,
    seedDemoAccounts: flag(env.SEED_DEMO_ACCOUNTS, false),
  }
}

/**
 * Fails fast on a configuration the service cannot run with, before it tries to open a connection.
 * Optional integrations (signing key, photo bucket, SMS, test mode) stay warnings in server.ts.
 */
export function validateConfig(config: Config): void {
  const problems: string[] = []
  if (!config.databaseUrl && !(config.dbHost && config.dbSecretArn)) {
    problems.push('Set DATABASE_URL, or both DB_HOST and DB_SECRET_ARN')
  }
  if (!config.databaseUrl && config.dbHost && !config.dbCaFile) {
    problems.push('Set DB_CA_FILE to the RDS CA bundle: the connection to RDS must verify TLS')
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    problems.push('PORT must be a whole number between 1 and 65535')
  }
  if (config.pwaOrigins.length === 0) {
    problems.push('Set PWA_ORIGINS to at least one allowed browser origin')
  }
  if (problems.length > 0) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`)
}
