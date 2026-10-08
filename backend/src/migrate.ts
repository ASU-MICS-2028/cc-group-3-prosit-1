import { readdir, readFile } from 'node:fs/promises'
import type { Db } from './db.js'

export const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url)

/**
 * Applies every migrations/*.sql file not yet recorded, in name order, each in its own transaction.
 * Two instances booting together are serialised by a transaction-level advisory lock, so the second one
 * waits and then finds nothing left to do.
 */
export async function migrate(db: Db, dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  const applied: string[] = []

  for (const name of files) {
    const sql = await readFile(new URL(name, dir), 'utf8')
    const ran = await db.tx(null, async (q) => {
      await q.query("SELECT pg_advisory_xact_lock(hashtext('agroconnect-migrations'))")
      const { rows } = await q.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
      if (rows.length > 0) return false
      await q.exec(sql)
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      return true
    })
    if (ran) applied.push(name)
  }
  return applied
}
