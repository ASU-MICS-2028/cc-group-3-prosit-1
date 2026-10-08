import { randomInt } from 'node:crypto'
import type { Express } from 'express'
import { ASSOCIATIONS, findUser, publicUser, tokenUser, type Ctx, type UserRow } from '../context.js'
import { pgError, type Queryable } from '../db.js'
import { HttpError, jsonBody, route } from '../http.js'
import { bearerToken, hashSecret, isE164, REFRESH_GRACE_SECONDS, requireAuth, sha256, ttlSecondsFor, verifySecret } from '../security.js'
import { log } from '../log.js'

const OTP_RATE_LIMIT = 3
const OTP_RATE_WINDOW_MS = 15 * 60_000
const OTP_ATTEMPTS = 5
const BLOCKED_STAFF_STATUSES = ['pending_verification', 'pending', 'rejected', 'suspended']

interface OtpRow {
  code_hash: string | null
  expires_at: Date | null
  attempts_left: number
  sent_at: Date[]
}

function requirePhone(raw: unknown): string {
  if (!isE164(raw)) throw new HttpError(400, 'invalid_request', 'Phone numbers must be in international format, like +233241234567.', { field: 'phone' })
  return raw as string
}

export function authRoutes(app: Express, ctx: Ctx): void {
  const { db, signer, settings } = ctx

  /** Issues a code, enforces 3 codes per phone per 15 minutes, and texts it unless in test mode. */
  async function issueOtp(phone: string): Promise<string> {
    const now = ctx.now()
    const code = String(randomInt(100_000, 1_000_000))
    await db.tx(null, async (q) => {
      const existing = (await q.query<OtpRow>('SELECT * FROM otp_codes WHERE phone_e164 = $1 FOR UPDATE', [phone])).rows[0]
      const recent = (existing?.sent_at ?? []).filter((at) => now - new Date(at).getTime() < OTP_RATE_WINDOW_MS)
      if (recent.length >= OTP_RATE_LIMIT) throw new HttpError(429, 'rate_limited', 'Too many codes requested. Try again later.')
      await q.query(
        `INSERT INTO otp_codes (phone_e164, code_hash, expires_at, attempts_left, sent_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (phone_e164) DO UPDATE SET code_hash = $2, expires_at = $3, attempts_left = $4, sent_at = $5`,
        [phone, sha256(code), new Date(now + settings.otpTtlMs), OTP_ATTEMPTS, [...recent, new Date(now)]],
      )
      // Inside the transaction: if the SMS cannot go out, the code and the rate-limit slot are not spent.
      if (settings.testMode) log.info('auth', 'test mode sign-in code', { phone, code })
      else await ctx.sms.send(phone, `Your AgroConnect code is ${code}. It expires in ${Math.round(settings.otpTtlMs / 60_000)} minutes. Do not share it.`)
    })
    return code
  }

  /** Checks a code. A wrong one is counted and committed before the error goes back. */
  async function checkOtp(phone: string, code: unknown): Promise<void> {
    const failure = await db.tx(null, async (q) => {
      const entry = (await q.query<OtpRow>('SELECT * FROM otp_codes WHERE phone_e164 = $1 FOR UPDATE', [phone])).rows[0]
      if (!entry?.code_hash) return new HttpError(400, 'invalid_code', 'Request a new code first.', { attemptsLeft: 0 })
      const spend = () => q.query('UPDATE otp_codes SET code_hash = NULL WHERE phone_e164 = $1', [phone])
      if (ctx.now() > new Date(entry.expires_at as Date).getTime()) {
        await spend()
        return new HttpError(410, 'code_expired', 'This code has expired. Request a new one.')
      }
      if (sha256(String(code ?? '')) !== entry.code_hash) {
        const attemptsLeft = entry.attempts_left - 1
        if (attemptsLeft <= 0) {
          await spend()
          return new HttpError(429, 'too_many_attempts', 'Too many wrong codes. Request a new one.')
        }
        await q.query('UPDATE otp_codes SET attempts_left = $2 WHERE phone_e164 = $1', [phone, attemptsLeft])
        return new HttpError(400, 'invalid_code', 'That code is not right.', { attemptsLeft })
      }
      await spend()
      return null
    })
    if (failure) throw failure
  }

  function assertNotLocked(user: UserRow): void {
    const lockedUntil = user.locked_until ? new Date(user.locked_until).getTime() : 0
    if (lockedUntil > ctx.now()) {
      throw new HttpError(429, 'locked', 'Too many wrong tries. Try again later.', { retryAfterSeconds: Math.ceil((lockedUntil - ctx.now()) / 1000) })
    }
  }

  /** Counts a wrong secret, locking the account at the limit. Returns how many tries remain. */
  async function recordFailure(user: UserRow): Promise<number> {
    const failed = user.failed_attempts + 1
    const attemptsLeft = Math.max(0, settings.maxAttempts - failed)
    if (attemptsLeft === 0) {
      await db.query('UPDATE users SET failed_attempts = 0, locked_until = $2 WHERE id = $1', [user.id, new Date(ctx.now() + settings.lockMs)])
    } else {
      await db.query('UPDATE users SET failed_attempts = $2 WHERE id = $1', [user.id, failed])
    }
    return attemptsLeft
  }

  const clearFailures = (user: UserRow) => db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id])

  const findFarmer = async (q: Queryable, phone: string) =>
    (await q.query<UserRow>("SELECT * FROM users WHERE role = 'farmer' AND phone_e164 = $1", [phone])).rows[0]

  async function findStaff(identifier: unknown): Promise<UserRow | undefined> {
    const phone = isE164(identifier) ? String(identifier) : null
    const loginId = String(identifier ?? '').trim().toUpperCase()
    const { rows } = await db.query<UserRow>(
      "SELECT * FROM users WHERE role <> 'farmer' AND (phone_e164 = $1 OR (login_id IS NOT NULL AND login_id = $2))",
      [phone, loginId],
    )
    return rows[0]
  }

  const sessionFor = async (user: UserRow) => ({ token: await signer.sign(tokenUser(user)), user: publicUser(user) })

  app.get('/.well-known/jwks.json', route(async () => [200, signer.jwks]))

  app.post(
    '/auth/farmer/start',
    route(async ({ req }) => {
      const body = jsonBody(req)
      const phone = requirePhone(body.phone)
      const existing = await findFarmer(db, phone)
      if (existing?.pin_hash && !body.forgotPin) return [200, { next: 'pin' }]
      const code = await issueOtp(phone)
      return [200, { next: 'otp', expiresInSeconds: Math.round(settings.otpTtlMs / 1000), ...(settings.testMode && { testCode: code }) }]
    }),
  )

  app.post(
    '/auth/farmer/verify-otp',
    route(async ({ req }) => {
      const body = jsonBody(req)
      const phone = requirePhone(body.phone)
      if (!/^\d{4}$/.test(String(body.pin ?? ''))) throw new HttpError(422, 'invalid_pin', 'The PIN must be exactly 4 digits.')
      await checkOtp(phone, body.code)

      const pinHash = await hashSecret(String(body.pin))
      const { rows } = await db.query<UserRow>(
        `INSERT INTO users (role, phone_e164, status, pin_hash) VALUES ('farmer', $1, 'approved', $2)
         ON CONFLICT (phone_e164) WHERE role = 'farmer'
         DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL
         RETURNING *`,
        [phone, pinHash],
      )
      return [200, await sessionFor(rows[0] as UserRow)]
    }),
  )

  app.post(
    '/auth/farmer/login',
    route(async ({ req }) => {
      const body = jsonBody(req)
      const user = await findFarmer(db, requirePhone(body.phone))
      if (!user?.pin_hash) throw new HttpError(401, 'wrong_pin', 'That PIN is not right.', { attemptsLeft: settings.maxAttempts - 1 })
      assertNotLocked(user)
      if (!(await verifySecret(String(body.pin ?? ''), user.pin_hash))) {
        throw new HttpError(401, 'wrong_pin', 'That PIN is not right.', { attemptsLeft: await recordFailure(user) })
      }
      await clearFailures(user)
      return [200, await sessionFor(user)]
    }),
  )

  app.post(
    '/auth/staff/signup',
    route(async ({ req }) => {
      const body = jsonBody(req)
      const phone = requirePhone(body.phone)
      const name = String(body.name ?? '').trim()
      if (name.length < 2) throw new HttpError(400, 'invalid_request', 'Enter your name.', { field: 'name' })
      if (!ASSOCIATIONS.includes(body.association)) throw new HttpError(400, 'invalid_request', 'Choose your association.', { field: 'association' })
      if (String(body.password ?? '').length < 8) throw new HttpError(400, 'invalid_request', 'The password needs at least 8 characters.', { field: 'password' })

      let user: UserRow
      try {
        // Always a field agent: a request cannot ask to be a coordinator or admin (AUTH-CONTRACT).
        const { rows } = await db.query<UserRow>(
          `INSERT INTO users (role, name, phone_e164, association_id, status, password_hash)
           VALUES ('agent', $1, $2, $3, 'pending_verification', $4) RETURNING *`,
          [name, phone, body.association, await hashSecret(String(body.password))],
        )
        user = rows[0] as UserRow
      } catch (error) {
        if (pgError(error)?.constraint === 'users_staff_phone_key') throw new HttpError(409, 'phone_taken', 'An account with this phone number already exists.')
        throw error
      }
      const code = await issueOtp(phone)
      return [201, { id: user.id, status: user.status, ...(settings.testMode && { testCode: code }) }]
    }),
  )

  app.post(
    '/auth/staff/verify-phone',
    route(async ({ req }) => {
      const body = jsonBody(req)
      const phone = requirePhone(body.phone)
      const user = await findStaff(phone)
      if (!user || user.status !== 'pending_verification') throw new HttpError(400, 'invalid_code', 'Nothing to verify for this number.', { attemptsLeft: 0 })
      await checkOtp(phone, body.code)
      await db.tx({ sub: user.id, role: user.role }, (q) => q.query("UPDATE users SET status = 'pending' WHERE id = $1", [user.id]))
      return [200, { status: 'pending' }]
    }),
  )

  app.post(
    '/auth/staff/login',
    route(async ({ req }) => {
      const body = jsonBody(req)
      const user = await findStaff(body.identifier)
      if (!user) throw new HttpError(401, 'invalid_credentials', 'Wrong ID or password.')
      assertNotLocked(user)
      if (!(await verifySecret(String(body.password ?? ''), user.password_hash))) {
        await recordFailure(user)
        throw new HttpError(401, 'invalid_credentials', 'Wrong ID or password.')
      }
      await clearFailures(user)
      if (BLOCKED_STAFF_STATUSES.includes(user.status)) {
        throw new HttpError(403, user.status === 'pending' ? 'pending_approval' : user.status, `Account is ${user.status}.`)
      }
      return [200, await sessionFor(user)]
    }),
  )

  app.post(
    '/auth/refresh',
    route(async ({ req }) => {
      const token = bearerToken(req)
      if (!token) throw new HttpError(401, 'unauthorized', 'Missing token')
      const claims = await signer.verify(token, { graceSeconds: REFRESH_GRACE_SECONDS })
      const user = await findUser(db, claims.sub)
      if (!user) throw new HttpError(401, 'unauthorized', 'Unknown account')
      // An admin's suspension reaches the phone here.
      if (user.role !== 'farmer' && user.status !== 'approved') throw new HttpError(403, user.status, `Account is ${user.status}.`)
      return [200, { token: await signer.sign(tokenUser(user), ttlSecondsFor(user.role)) }]
    }),
  )

  app.get(
    '/auth/me',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req)
      const user = await findUser(db, claims.sub)
      if (!user) throw new HttpError(401, 'unauthorized', 'Unknown account')
      return [200, publicUser(user)]
    }),
  )
}
