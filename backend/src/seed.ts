import type { Db } from './db.js'
import { hashSecret } from './security.js'
import { log } from './log.js'

/**
 * The demo accounts documented in frontend/agroconnect-pwa/docs/WALKTHROUGH.md, identical to the mock's.
 * Their passwords are public, so they are only seeded when SEED_DEMO_ACCOUNTS=true.
 */
export const DEMO_ACCOUNTS = {
  admin: { loginId: 'ADM-001', password: 'admin-test-pass' },
  coordinator: { loginId: 'CO-001', password: 'coord-test-pass' },
  agent: { loginId: 'AG-0001', password: 'agent-test-pass' },
  pendingAgent: { phone: '+233200000099', password: 'pending-test-pass' },
  farmer: { phone: '+233200000010', pin: '1234' },
}

interface SeedUser {
  id: string
  role: string
  name: string
  phone: string
  loginId: string | null
  assoc: string | null
  status: string
  password?: string
  pin?: string
}

/** Adds the account if its id is not taken yet; never overwrites one (a changed password stays changed). */
async function upsert(db: Db, user: SeedUser): Promise<void> {
  await db.query(
    `INSERT INTO users (id, role, name, phone_e164, login_id, association_id, status, password_hash, pin_hash, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'seed') ON CONFLICT DO NOTHING`,
    [
      user.id, user.role, user.name, user.phone, user.loginId, user.assoc, user.status,
      user.password ? await hashSecret(user.password) : null, user.pin ? await hashSecret(user.pin) : null,
    ],
  )
}

/** Moves the ID sequences past any seeded IDs, so the next approved agent is not given AG-0001 again. */
async function syncLoginSequences(db: Db): Promise<void> {
  await db.query(`SELECT setval('agent_login_seq', greatest(1, (SELECT max(substring(login_id from 4)::int) FROM users WHERE login_id ~ '^AG-\\d+$')), true)`)
  await db.query(`SELECT setval('coordinator_login_seq', greatest(1, (SELECT max(substring(login_id from 4)::int) FROM users WHERE login_id ~ '^CO-\\d+$')), true)`)
}

export async function seedDemoAccounts(db: Db): Promise<void> {
  await upsert(db, { id: 'U-admin', role: 'admin', name: 'Ama Admin', phone: '+233200000001', loginId: DEMO_ACCOUNTS.admin.loginId, assoc: null, status: 'approved', password: DEMO_ACCOUNTS.admin.password })
  await upsert(db, { id: 'U-coord', role: 'coordinator', name: 'Kwame Coordinator', phone: '+233200000002', loginId: DEMO_ACCOUNTS.coordinator.loginId, assoc: 'ashaiman-ufa', status: 'approved', password: DEMO_ACCOUNTS.coordinator.password })
  await upsert(db, { id: 'U-agent', role: 'agent', name: 'Efua Agent', phone: '+233200000003', loginId: DEMO_ACCOUNTS.agent.loginId, assoc: 'ashaiman-ufa', status: 'approved', password: DEMO_ACCOUNTS.agent.password })
  await upsert(db, { id: 'U-pending', role: 'agent', name: 'Pending Pat', phone: DEMO_ACCOUNTS.pendingAgent.phone, loginId: null, assoc: 'ashaiman-ufa', status: 'pending', password: DEMO_ACCOUNTS.pendingAgent.password })
  await upsert(db, { id: 'U-farmer', role: 'farmer', name: 'Akosua Farmer', phone: DEMO_ACCOUNTS.farmer.phone, loginId: null, assoc: null, status: 'approved', pin: DEMO_ACCOUNTS.farmer.pin })
  await syncLoginSequences(db)
}

export interface AdminSeed {
  login_id: string
  name: string
  phone: string
  password: string
}

/** AUTH-CONTRACT: admins are seeded (ADMIN_SEED), never created through the API. */
export async function seedAdmin(db: Db, seed: AdminSeed): Promise<void> {
  if (!seed.login_id || !seed.phone || String(seed.password ?? '').length < 12) {
    log.warn('seed', 'admin seed ignored: it needs login_id, phone and a password of at least 12 characters')
    return
  }
  await upsert(db, { id: `U-${seed.login_id.toLowerCase()}`, role: 'admin', name: seed.name || 'Administrator', phone: seed.phone, loginId: seed.login_id.toUpperCase(), assoc: null, status: 'approved', password: seed.password })
}
