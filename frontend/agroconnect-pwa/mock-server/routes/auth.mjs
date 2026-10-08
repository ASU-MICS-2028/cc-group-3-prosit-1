import { randomInt } from 'node:crypto'
import { HttpError, readJson } from '../http.mjs'
import { hashSecret, jwks, REFRESH_GRACE_SECONDS, requireAuth, sha256, signToken, ttlSecondsFor, verifyToken, verifySecret } from '../security.mjs'
import { ASSOCIATIONS, isE164, publicUser } from '../store.mjs'

const OTP_RATE_LIMIT = 3
const OTP_RATE_WINDOW_MS = 15 * 60_000
const OTP_ATTEMPTS = 5
const BLOCKED_STAFF_STATUSES = ['pending_verification', 'pending', 'rejected', 'suspended']

export function authRoutes(ctx) {
  const { store, config } = ctx

  function issueOtp(phone) {
    const now = config.now()
    const entry = store.otps.get(phone) ?? { sentAt: [] }
    entry.sentAt = entry.sentAt.filter((sentAt) => now - sentAt < OTP_RATE_WINDOW_MS)
    if (entry.sentAt.length >= OTP_RATE_LIMIT) {
      throw new HttpError(429, 'rate_limited', 'Too many codes requested. Try again later.')
    }
    const code = String(randomInt(100_000, 1_000_000))
    entry.sentAt.push(now)
    Object.assign(entry, { codeHash: sha256(code), expiresAt: now + config.otpTtlMs, attemptsLeft: OTP_ATTEMPTS })
    store.otps.set(phone, entry)
    if (config.testMode) console.log(`[auth] Test mode: code for ${phone} is ${code}`)
    return code
  }

  function checkOtp(phone, code) {
    const entry = store.otps.get(phone)
    if (!entry?.codeHash) throw new HttpError(400, 'invalid_code', 'Request a new code first.', { attemptsLeft: 0 })
    if (config.now() > entry.expiresAt) {
      entry.codeHash = null
      throw new HttpError(410, 'code_expired', 'This code has expired. Request a new one.')
    }
    if (sha256(String(code ?? '')) !== entry.codeHash) {
      entry.attemptsLeft -= 1
      if (entry.attemptsLeft <= 0) {
        entry.codeHash = null
        throw new HttpError(429, 'too_many_attempts', 'Too many wrong codes. Request a new one.')
      }
      throw new HttpError(400, 'invalid_code', 'That code is not right.', { attemptsLeft: entry.attemptsLeft })
    }
    entry.codeHash = null
  }

  function assertNotLocked(user) {
    if (user.lockedUntil > config.now()) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil - config.now()) / 1000)
      throw new HttpError(429, 'locked', 'Too many wrong tries. Try again later.', { retryAfterSeconds })
    }
  }

  /** Counts a wrong secret and locks the account at the limit. Returns how many tries remain. */
  function recordFailure(user) {
    user.failedAttempts += 1
    const attemptsLeft = Math.max(0, config.maxAttempts - user.failedAttempts)
    if (attemptsLeft === 0) {
      user.lockedUntil = config.now() + config.lockMs
      user.failedAttempts = 0
    }
    return attemptsLeft
  }

  const findFarmer = (phone) => [...store.users.values()].find((u) => u.role === 'farmer' && u.phone === phone)

  function findStaff(identifier) {
    const phone = isE164(identifier) ? identifier : null
    const loginId = String(identifier ?? '').trim().toUpperCase()
    return [...store.users.values()].find((u) => u.role !== 'farmer' && ((phone && u.phone === phone) || (u.loginId && u.loginId === loginId)))
  }

  async function sessionFor(user) {
    return { token: await signToken(user), user: publicUser(user) }
  }

  function requirePhone(raw) {
    if (!isE164(raw)) throw new HttpError(400, 'invalid_request', 'Phone numbers must be in international format, like +233241234567.', { field: 'phone' })
    return raw
  }

  return [
    ['GET', '/.well-known/jwks.json', async () => [200, jwks]],

    ['POST', '/auth/farmer/start', async ({ req }) => {
      const body = await readJson(req)
      const phone = requirePhone(body.phone)
      const existing = findFarmer(phone)
      if (existing?.pinHash && !body.forgotPin) return [200, { next: 'pin' }]
      const code = issueOtp(phone)
      return [200, { next: 'otp', expiresInSeconds: Math.round(config.otpTtlMs / 1000), ...(config.testMode && { testCode: code }) }]
    }],

    ['POST', '/auth/farmer/verify-otp', async ({ req }) => {
      const body = await readJson(req)
      const phone = requirePhone(body.phone)
      if (!/^\d{4}$/.test(String(body.pin ?? ''))) throw new HttpError(422, 'invalid_pin', 'The PIN must be exactly 4 digits.')
      checkOtp(phone, body.code)

      let user = findFarmer(phone)
      if (!user) {
        user = { id: `F-${++store.counters.farmer}`, role: 'farmer', name: '', phone, status: 'approved', failedAttempts: 0, lockedUntil: 0, createdAt: config.now() }
        store.users.set(user.id, user)
      }
      user.pinHash = await hashSecret(body.pin)
      user.failedAttempts = 0
      user.lockedUntil = 0
      return [200, await sessionFor(user)]
    }],

    ['POST', '/auth/farmer/login', async ({ req }) => {
      const body = await readJson(req)
      const user = findFarmer(requirePhone(body.phone))
      if (!user?.pinHash) throw new HttpError(401, 'wrong_pin', 'That PIN is not right.', { attemptsLeft: config.maxAttempts - 1 })
      assertNotLocked(user)
      if (!(await verifySecret(String(body.pin ?? ''), user.pinHash))) {
        throw new HttpError(401, 'wrong_pin', 'That PIN is not right.', { attemptsLeft: recordFailure(user) })
      }
      user.failedAttempts = 0
      return [200, await sessionFor(user)]
    }],

    ['POST', '/auth/staff/signup', async ({ req }) => {
      const body = await readJson(req)
      const phone = requirePhone(body.phone)
      if (String(body.name ?? '').trim().length < 2) throw new HttpError(400, 'invalid_request', 'Enter your name.', { field: 'name' })
      if (!ASSOCIATIONS.includes(body.association)) throw new HttpError(400, 'invalid_request', 'Choose your association.', { field: 'association' })
      if (String(body.password ?? '').length < 8) throw new HttpError(400, 'invalid_request', 'The password needs at least 8 characters.', { field: 'password' })
      if ([...store.users.values()].some((u) => u.role !== 'farmer' && u.phone === phone)) {
        throw new HttpError(409, 'phone_taken', 'An account with this phone number already exists.')
      }

      const user = {
        id: `U-${++store.counters.user}`,
        role: 'agent',
        name: body.name.trim(),
        phone,
        loginId: null,
        assoc: body.association,
        status: 'pending_verification',
        passwordHash: await hashSecret(body.password),
        failedAttempts: 0,
        lockedUntil: 0,
        createdAt: config.now(),
      }
      store.users.set(user.id, user)
      const code = issueOtp(phone)
      return [201, { id: user.id, status: user.status, ...(config.testMode && { testCode: code }) }]
    }],

    ['POST', '/auth/staff/verify-phone', async ({ req }) => {
      const body = await readJson(req)
      const phone = requirePhone(body.phone)
      const user = findStaff(phone)
      if (!user || user.status !== 'pending_verification') throw new HttpError(400, 'invalid_code', 'Nothing to verify for this number.', { attemptsLeft: 0 })
      checkOtp(phone, body.code)
      user.status = 'pending'
      return [200, { status: 'pending' }]
    }],

    ['POST', '/auth/staff/login', async ({ req }) => {
      const body = await readJson(req)
      const user = findStaff(body.identifier)
      if (!user) throw new HttpError(401, 'invalid_credentials', 'Wrong ID or password.')
      assertNotLocked(user)
      if (!(await verifySecret(String(body.password ?? ''), user.passwordHash))) {
        recordFailure(user)
        throw new HttpError(401, 'invalid_credentials', 'Wrong ID or password.')
      }
      user.failedAttempts = 0
      if (BLOCKED_STAFF_STATUSES.includes(user.status)) throw new HttpError(403, user.status === 'pending' ? 'pending_approval' : user.status, `Account is ${user.status}.`)
      return [200, await sessionFor(user)]
    }],

    ['POST', '/auth/refresh', async ({ req }) => {
      const [, token] = (req.headers.authorization ?? '').split(' ')
      if (!token) throw new HttpError(401, 'unauthorized', 'Missing token')
      const claims = await verifyToken(token, { graceSeconds: REFRESH_GRACE_SECONDS })
      const user = store.users.get(claims.sub)
      if (!user) throw new HttpError(401, 'unauthorized', 'Unknown account')
      if (Number(claims.ver ?? 1) !== Number(user.tokenVersion ?? 1)) throw new HttpError(401, 'token_revoked', 'This session has ended. Sign in again.')
      if (user.role !== 'farmer' && user.status !== 'approved') throw new HttpError(403, user.status, `Account is ${user.status}.`)
      return [200, { token: await signToken(user, ttlSecondsFor(user.role)) }]
    }],

    ['GET', '/auth/me', async ({ req }) => {
      const claims = await requireAuth(req)
      const user = store.users.get(claims.sub)
      if (!user) throw new HttpError(401, 'unauthorized', 'Unknown account')
      return [200, publicUser(user)]
    }],

    ['POST', '/auth/logout', async ({ req }) => {
      const claims = await requireAuth(req)
      const user = store.users.get(claims.sub)
      if (user) user.tokenVersion = (user.tokenVersion ?? 1) + 1
      return [204]
    }],

    ['POST', '/auth/staff/password', async ({ req }) => {
      const claims = await requireAuth(req, ['agent', 'coordinator', 'admin'])
      const user = store.users.get(claims.sub)
      const body = await readJson(req)
      if (!(await verifySecret(String(body.currentPassword ?? ''), user.passwordHash))) {
        throw new HttpError(401, 'wrong_password', 'That password is not right.')
      }
      if (String(body.newPassword ?? '').length < 8) throw new HttpError(400, 'invalid_request', 'The password needs at least 8 characters.', { field: 'newPassword' })
      user.passwordHash = await hashSecret(body.newPassword)
      user.tokenVersion = (user.tokenVersion ?? 1) + 1
      return [200, { token: await signToken(user) }]
    }],

    ['POST', '/auth/farmer/pin', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const user = store.users.get(claims.sub)
      const body = await readJson(req)
      if (!(await verifySecret(String(body.pin ?? ''), user.pinHash))) throw new HttpError(401, 'wrong_pin', 'That PIN is not right.')
      if (!/^\d{4}$/.test(String(body.newPin ?? ''))) throw new HttpError(422, 'invalid_pin', 'The PIN must be exactly 4 digits.')
      user.pinHash = await hashSecret(body.newPin)
      user.tokenVersion = (user.tokenVersion ?? 1) + 1
      return [200, { token: await signToken(user) }]
    }],
  ]
}
