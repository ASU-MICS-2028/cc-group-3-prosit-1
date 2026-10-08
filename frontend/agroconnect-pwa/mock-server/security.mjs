import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'
import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT } from 'jose'
import { HttpError } from './http.mjs'

const scryptAsync = promisify(scrypt)

export async function hashSecret(secret) {
  const salt = randomBytes(16)
  const key = await scryptAsync(secret, salt, 32)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifySecret(secret, stored) {
  const [saltHex, keyHex] = stored.split(':')
  const key = await scryptAsync(secret, Buffer.from(saltHex, 'hex'), 32)
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'))
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const KEY_ID = 'mock-1'
let publicKey
let privateKey
/** The public key set other services would fetch. A live binding: it changes if loadKeys() swaps the keys. */
export let jwks

async function adopt(pair) {
  ;({ publicKey, privateKey } = pair)
  jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' }] }
}

await adopt(await generateKeyPair('RS256', { extractable: true }))

/**
 * Reuses the signing key saved in `file`, or saves the current one there. Without this every restart
 * makes a new key, which invalidates every token already on a phone. Mock only: a real service keeps
 * its private key in a secrets manager.
 */
export async function loadKeys(file) {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'))
    await adopt({ publicKey: await importJWK(saved.public, 'RS256'), privateKey: await importJWK(saved.private, 'RS256') })
    return 'loaded'
  } catch {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ public: await exportJWK(publicKey), private: await exportJWK(privateKey) }), { mode: 0o600 })
    return 'created'
  }
}

const DAY = 24 * 3600
export const ttlSecondsFor = (role) => (role === 'farmer' ? 30 * DAY : 7 * DAY)
export const REFRESH_GRACE_SECONDS = 30 * DAY

export function signToken(user, ttlSeconds = ttlSecondsFor(user.role)) {
  return new SignJWT({ role: user.role, name: user.name, phone: user.phone, assoc: user.assoc, ver: user.tokenVersion ?? 1 })
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(privateKey)
}

export async function verifyToken(token, { graceSeconds = 0 } = {}) {
  try {
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'], clockTolerance: graceSeconds })
    return payload
  } catch (error) {
    const expired = error?.code === 'ERR_JWT_EXPIRED'
    throw new HttpError(401, expired ? 'token_expired' : 'unauthorized', expired ? 'Token expired' : 'Invalid token')
  }
}

/**
 * Loads the account behind the bearer token and rejects a revoked or non-approved one, attaching the claims
 * to the request. Unlike requireAuth it stays quiet when the token cannot be verified (expired), leaving that
 * to requireAuth or to /auth/refresh, which accepts a token that expired recently on purpose.
 */
export async function resolveSession(req, store) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ')
  if (scheme !== 'Bearer' || !token) return
  let claims
  try {
    claims = await verifyToken(token)
  } catch {
    return
  }
  const user = store.users.get(claims.sub)
  if (!user) throw new HttpError(401, 'unauthorized', 'Unknown account')
  if (Number(claims.ver ?? 1) !== Number(user.tokenVersion ?? 1)) throw new HttpError(401, 'token_revoked', 'This session has ended. Sign in again.')
  if (user.status !== 'approved') throw new HttpError(403, user.status === 'pending' ? 'pending_approval' : user.status, `Account is ${user.status}.`)
  req.claims = claims
}

/** Returns the token's claims, or throws 401 (no valid token) / 403 (wrong role). */
export async function requireAuth(req, roles) {
  let claims = req.claims
  if (!claims) {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'unauthorized', 'Missing token')
    claims = await verifyToken(token)
  }
  if (roles && !roles.includes(claims.role)) throw new HttpError(403, 'forbidden', 'Not allowed for this role')
  return claims
}
