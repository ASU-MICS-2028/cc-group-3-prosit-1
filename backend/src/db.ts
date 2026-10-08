import { readFileSync } from 'node:fs'
import pg from 'pg'
import type { Config } from './config.js'
import { getSecretJson } from './secrets.js'
import { describeError, log } from './log.js'

export interface Row {
  [column: string]: any
}

export interface Queryable {
  query<R extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>
  /** Runs several statements with no parameters (migrations). */
  exec(sql: string): Promise<void>
}

/** Who is acting, for the audit trigger. Mirrors the token's sub and role. */
export interface Actor {
  sub: string
  role: string
}

export interface Db extends Queryable {
  /**
   * Runs `fn` in one transaction. The actor goes to the audit trigger through set_config(..., true), the
   * parameterised and transaction-local equivalent of SET LOCAL app.actor (which cannot take a parameter).
   */
  tx<T>(actor: Actor | null, fn: (q: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export async function setActor(q: Queryable, actor: Actor | null): Promise<void> {
  if (actor) await q.query("SELECT set_config('app.actor', $1, true), set_config('app.actor_role', $2, true)", [actor.sub, actor.role])
}

interface DbCredentials {
  username: string
  password: string
}

/**
 * Postgres on RDS, or any DATABASE_URL for local work. On RDS the password is fetched for every new
 * connection, so a rotated managed secret is picked up without a restart, and TLS is always verified
 * against the RDS CA bundle shipped in the image.
 */
export async function createPgDb(config: Config): Promise<Db> {
  let poolConfig: pg.PoolConfig
  if (config.databaseUrl) {
    poolConfig = { connectionString: config.databaseUrl }
  } else {
    if (!config.dbHost || !config.dbSecretArn) throw new Error('Set DATABASE_URL, or DB_HOST and DB_SECRET_ARN')
    if (!config.dbCaFile) throw new Error('Set DB_CA_FILE to the RDS CA bundle: the connection to RDS must verify TLS')
    const secretArn = config.dbSecretArn
    const [host, port] = config.dbHost.split(':')
    const { username } = await getSecretJson<DbCredentials>(config, secretArn)
    poolConfig = {
      host,
      port: Number(port) || 5432,
      database: config.dbName,
      user: username,
      password: async () => (await getSecretJson<DbCredentials>(config, secretArn)).password,
      ssl: { ca: readFileSync(config.dbCaFile, 'utf8'), rejectUnauthorized: true },
    }
  }

  const pool = new pg.Pool({ max: 10, idleTimeoutMillis: 30_000, ...poolConfig })
  pool.on('error', (error) => log.error('db', 'idle client error', describeError(error)))

  const asQueryable = (client: pg.Pool | pg.PoolClient): Queryable => ({
    query: async (sql, params) => client.query(sql, params as unknown[]),
    exec: async (sql) => {
      await client.query(sql)
    },
  })

  return {
    ...asQueryable(pool),
    async tx(actor, fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const q = asQueryable(client)
        await setActor(q, actor)
        const result = await fn(q)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/** Translates the driver's error into the SQLSTATE and constraint name the contracts talk about. */
export function pgError(error: unknown): { code: string; constraint: string | undefined } | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  const { code, constraint } = error as { code: unknown; constraint?: unknown }
  return typeof code === 'string' ? { code, constraint: typeof constraint === 'string' ? constraint : undefined } : null
}

/** Numbers come back from NUMERIC and BIGINT columns as strings; this keeps the JSON as numbers. */
export const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value))
export const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null)
