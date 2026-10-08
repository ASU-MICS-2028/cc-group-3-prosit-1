// Boots the real API on PGlite (Postgres compiled to WebAssembly) or, with TEST_DATABASE_URL, on a real
// Postgres, so the contract tests ported from the PWA's mock server run against real SQL, constraints and triggers.
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'
import { createApp as createExpressApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { DEFAULT_SETTINGS, type Ctx, type Settings } from '../src/context.js'
import { createPgDb, setActor, type Db, type Queryable } from '../src/db.js'
import { memorySms, memoryStorage, type CheckoutProvider } from '../src/integrations.js'
import { migrate } from '../src/migrate.js'
import { createSigner, type TokenUser } from '../src/security.js'
import { seedDemoAccounts } from '../src/seed.js'

export { DEMO_ACCOUNTS } from '../src/seed.js'

/** The same text always maps to the same UUID, so tests can keep readable client IDs like uid('p-1'). */
export function uid(text: string): string {
  const hex = createHash('sha256').update(text).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function pgliteDb(pg: PGlite): Db {
  const wrap = (q: Pick<PGlite, 'query' | 'exec'>): Queryable => ({
    query: async (sql, params) => q.query(sql, params as unknown[]) as never,
    exec: async (sql) => {
      await q.exec(sql)
    },
  })
  return {
    ...wrap(pg),
    tx: (actor, fn) =>
      pg.transaction(async (tx) => {
        const q = wrap(tx)
        await setActor(q, actor)
        return fn(q)
      }),
    close: () => pg.close(),
  }
}

// One signing key for every test app, so a token made with signToken() is accepted by any of them.
const signer = await createSigner({ jwtSecretArn: null, region: 'af-south-1' })

export const signToken = (user: Partial<TokenUser> & { id: string; role: TokenUser['role'] }, ttlSeconds?: number) =>
  signer.sign({ name: '', phone: '', assoc: null, ...user }, ttlSeconds)

/**
 * With TEST_DATABASE_URL set (CI, or a local Postgres), every test app gets its own database cloned from a
 * migrated and seeded template, and talks to it through the production pg driver. Otherwise PGlite.
 */
const REAL_PG = process.env.TEST_DATABASE_URL ?? null
let realTemplate: Promise<string> | null = null
let realCount = 0

async function adminQuery(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: REAL_PG as string })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

const databaseUrl = (name: string) => {
  const url = new URL(REAL_PG as string)
  url.pathname = `/${name}`
  return url.toString()
}

async function realPgDb(): Promise<Db> {
  realTemplate ??= (async () => {
    const name = `agro_template_${process.pid}`
    await adminQuery(`DROP DATABASE IF EXISTS ${name}`)
    await adminQuery(`CREATE DATABASE ${name}`)
    const db = await createPgDb({ ...loadConfig({}), databaseUrl: databaseUrl(name) })
    await migrate(db)
    await seedDemoAccounts(db)
    await db.close()
    return name
  })()
  const template = await realTemplate
  const name = `agro_test_${process.pid}_${++realCount}`
  await adminQuery(`CREATE DATABASE ${name} TEMPLATE ${template}`)
  const db = await createPgDb({ ...loadConfig({}), databaseUrl: databaseUrl(name) })
  return {
    ...db,
    close: async () => {
      await db.close()
      await adminQuery(`DROP DATABASE IF EXISTS ${name}`)
    },
  }
}

/** Migrated and seeded once; every test app starts from a copy of this. */
let template: Promise<File | Blob> | null = null
function templateData(): Promise<File | Blob> {
  template ??= (async () => {
    const pg = new PGlite()
    const db = pgliteDb(pg)
    await migrate(db)
    await seedDemoAccounts(db)
    const dump = await pg.dumpDataDir()
    await pg.close()
    return dump
  })()
  return template
}

export interface TestOptions extends Partial<Settings> {
  now?: () => number
  checkout?: CheckoutProvider | null
}

export interface TestServer extends Server {
  ctx: Ctx
  sms: ReturnType<typeof memorySms>
}

/** Like the mock's createApp: a fresh, seeded server, not yet listening. Test mode is on unless turned off. */
export async function createApp({ now = Date.now, checkout = null, ...settings }: TestOptions = {}): Promise<TestServer> {
  const db = REAL_PG ? await realPgDb() : pgliteDb(new PGlite({ loadDataDir: await templateData() }))
  const sms = memorySms()
  const ctx: Ctx = {
    db,
    signer,
    sms,
    storage: memoryStorage(),
    checkout,
    // Rate limiting is relaxed by default so it does not interfere with the contract tests; the
    // dedicated rate-limit test passes its own settings.
    settings: { ...DEFAULT_SETTINGS, testMode: true, pwaOrigins: ['https://app.example'], rateLimit: { windowMs: 60_000, max: 1_000_000, authMax: 1_000_000 }, ...settings },
    now,
  }
  const server = createServer(createExpressApp(ctx)) as TestServer
  server.ctx = ctx
  server.sms = sms
  server.on('close', () => void db.close())
  return server
}
