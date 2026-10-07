import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose'
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
const { publicKey, privateKey } = await generateKeyPair('RS256')
export const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' }] }

const DAY = 24 * 3600
export const ttlSecondsFor = (role) => (role === 'farmer' ? 30 * DAY : 7 * DAY)
export const REFRESH_GRACE_SECONDS = 30 * DAY

export function signToken(user, ttlSeconds = ttlSecondsFor(user.role)) {
  return new SignJWT({ role: user.role, name: user.name, assoc: user.assoc })
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

/** Returns the token's claims, or throws 401 (no valid token) / 403 (wrong role). */
export async function requireAuth(req, roles) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ')
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'unauthorized', 'Missing token')
  const claims = await verifyToken(token)
  if (roles && !roles.includes(claims.role)) throw new HttpError(403, 'forbidden', 'Not allowed for this role')
  return claims
}
