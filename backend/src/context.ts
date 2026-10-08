import type { Db, Queryable, Row } from './db.js'
import type { CheckoutProvider, Sms, Storage } from './integrations.js'
import type { Claims, Signer } from './security.js'
import type { PushSender } from './push.js'

export interface Settings {
  /** Sign-in codes come back in responses and no SMS is sent (AUTH_TEST_MODE). */
  testMode: boolean
  otpTtlMs: number
  lockMs: number
  maxAttempts: number
  /** How long a simulated payment stays pending before it settles. */
  paymentDelayMs: number
  pwaOrigins: string[]
  /** Per-IP rate limits. `max` covers the whole API, `authMax` the sign-in and sign-up routes. */
  rateLimit: { windowMs: number; max: number; authMax: number }
}

export const DEFAULT_SETTINGS: Settings = {
  testMode: false,
  otpTtlMs: 5 * 60_000,
  lockMs: 15 * 60_000,
  maxAttempts: 5,
  paymentDelayMs: 4000,
  pwaOrigins: [],
  rateLimit: { windowMs: 60_000, max: 300, authMax: 20 },
}

export interface Ctx {
  db: Db
  signer: Signer
  sms: Sms
  storage: Storage
  /** votex365, or null to simulate every payment. */
  checkout: CheckoutProvider | null
  settings: Settings
  now: () => number
  /** Web Push sender, or null/absent when VAPID keys are not configured (notifications off). */
  push?: PushSender | null
}

export const ASSOCIATIONS = ['ashaiman-ufa', 'ngfn']
export const CROPS = ['maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain']
export const CURRENCIES = ['GHS', 'NGN', 'KES']

export const nowDate = (ctx: Ctx) => new Date(ctx.now())
export const nowIso = (ctx: Ctx) => nowDate(ctx).toISOString()
export const actorOf = (claims: Claims) => ({ sub: claims.sub, role: claims.role })

export interface UserRow extends Row {
  id: string
  role: Claims['role']
  name: string
  phone_e164: string
  login_id: string | null
  association_id: string | null
  status: string
  pin_hash: string | null
  password_hash: string | null
  failed_attempts: number
  locked_until: Date | null
}

export const publicUser = (user: UserRow) => ({
  id: user.id,
  role: user.role,
  name: user.name,
  phone: user.phone_e164,
  assoc: user.association_id,
  loginId: user.login_id,
  status: user.status,
})

export const tokenUser = (user: UserRow) => ({ id: user.id, role: user.role, name: user.name, phone: user.phone_e164, assoc: user.association_id })

export async function findUser(q: Queryable, id: string): Promise<UserRow | undefined> {
  return (await q.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])).rows[0]
}

/** An audit entry for something that is not a row change (an export). ADMIN-CONTRACT: table_name 'app'. */
export async function auditEvent(q: Queryable, claims: Claims, event: string, recordId: string, detail: string): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (table_name, record_id, action, event, detail, app_actor, actor_role) VALUES ('app', $1, 'APP', $2, $3, $4, $5)`,
    [recordId, event, detail, claims.sub, claims.role],
  )
}
