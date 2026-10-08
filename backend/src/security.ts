import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, scrypt, timingSafeEqual, type KeyObject } from 'node:crypto'
import { promisify } from 'node:util'
import type { Request } from 'express'
import { calculateJwkThumbprint, exportJWK, jwtVerify, SignJWT, type JWK } from 'jose'
import type { Config } from './config.js'
import { HttpError } from './http.js'
import { getSecretJson } from './secrets.js'

const scryptAsync = promisify(scrypt) as (secret: string, salt: Buffer, length: number) => Promise<Buffer>

/** scrypt with a random salt (stdlib, memory-hard). Stored as "salt:key" in hex. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(secret, salt, 32)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifySecret(secret: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [saltHex, keyHex] = stored.split(':')
  if (!saltHex || !keyHex) return false
  const key = await scryptAsync(secret, Buffer.from(saltHex, 'hex'), 32)
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'))
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export interface Claims {
  sub: string
  role: 'farmer' | 'agent' | 'coordinator' | 'admin'
  name: string
  phone: string
  assoc?: string | null
  /** The account's token_version when the token was signed; a mismatch means the session was revoked. */
  ver?: number
}

export interface TokenUser {
  id: string
  role: Claims['role']
  name: string
  phone: string
  assoc: string | null
  ver: number
}

/** A request the session middleware has looked at: the resolved claims, or the failure to rethrow. */
export interface SessionRequest extends Request {
  claims?: Claims
  authError?: unknown
}

const DAY = 24 * 3600
export const ttlSecondsFor = (role: string) => (role === 'farmer' ? 30 * DAY : 7 * DAY)
/** Phones go offline for days, so a token may be refreshed up to 30 days after it expired (AUTH-CONTRACT). */
export const REFRESH_GRACE_SECONDS = 30 * DAY

export interface Signer {
  jwks: { keys: JWK[] }
  sign(user: TokenUser, ttlSeconds?: number): Promise<string>
  verify(token: string, options?: { graceSeconds?: number }): Promise<Claims>
}

/**
 * RS256 signing. In production the private key comes from Secrets Manager ({ private_key_pem }, PKCS#8),
 * so every instance signs with the same key and tokens survive deploys. Without one (tests, local work)
 * a throwaway key is generated, and every restart signs everyone out.
 */
export async function createSigner(config: Pick<Config, 'jwtSecretArn' | 'region'> & Partial<Config>): Promise<Signer> {
  const secret = config.jwtSecretArn
    ? await getSecretJson<{ private_key_pem?: string }>(config as Config, config.jwtSecretArn).catch((error: Error) => {
        console.error(`[auth] cannot read the signing key (${error.message})`)
        return null
      })
    : null
  let privateKey: KeyObject
  if (secret?.private_key_pem) {
    privateKey = createPrivateKey(secret.private_key_pem)
  } else {
    // Booting beats crash-looping: terraform creates the secret empty and its first instances start before
    // anyone can fill it. Each instance then has its own key, so tokens fail between instances until the
    // secret is set and the instances are refreshed.
    privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    console.warn('[auth] no signing key in JWT_SECRET_ARN: using a throwaway key. Set the secret, then refresh the instances.')
  }
  const publicKey = createPublicKey(privateKey)
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const jwks = { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] }

  return {
    jwks,
    sign(user, ttlSeconds = ttlSecondsFor(user.role)) {
      return new SignJWT({ role: user.role, name: user.name, phone: user.phone, assoc: user.assoc ?? undefined, ver: user.ver })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
        .sign(privateKey)
    },
    async verify(token, { graceSeconds = 0 } = {}) {
      try {
        const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'], clockTolerance: graceSeconds })
        return payload as unknown as Claims
      } catch (error) {
        const expired = (error as { code?: string }).code === 'ERR_JWT_EXPIRED'
        throw new HttpError(401, expired ? 'token_expired' : 'unauthorized', expired ? 'Token expired' : 'Invalid token')
      }
    },
  }
}

export function bearerToken(req: Request): string | null {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ')
  return scheme === 'Bearer' && token ? token : null
}

/** The token's claims, or 401 (no valid token) / 403 (role not allowed). The actor is never read from the body. */
export async function requireAuth(signer: Signer, req: Request, roles?: readonly Claims['role'][]): Promise<Claims> {
  const session = req as SessionRequest
  // The session middleware resolves the account (and rejects a revoked/suspended one) before the route runs.
  let claims = session.claims
  if (!claims) {
    if (session.authError) throw session.authError
    const token = bearerToken(req)
    if (!token) throw new HttpError(401, 'unauthorized', 'Missing token')
    claims = await signer.verify(token)
  }
  if (roles && !roles.includes(claims.role)) throw new HttpError(403, 'forbidden', 'Not allowed for this role')
  return claims
}

/** The contracts only accept E.164: + and 8 to 15 digits, no leading 0 after the country code. */
export const isE164 = (value: unknown) => /^\+[1-9]\d{7,14}$/.test(String(value ?? ''))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: unknown) => UUID.test(String(value ?? ''))
