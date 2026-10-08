import type { NextFunction, Request, Response } from 'express'
import { findUser, type Ctx } from './context.js'
import { HttpError } from './http.js'
import { bearerToken, type SessionRequest } from './security.js'

/**
 * Resolves the account behind the bearer token once per request. A token whose `ver` no longer matches the
 * account's `token_version` (a logout or a credential change) is refused with 401 `token_revoked`, and an
 * account that is no longer `approved` with 403. That is what makes revocation and suspension immediate
 * instead of waiting for the next refresh. The route then reads the claims through `requireAuth`.
 *
 * A token that simply cannot be verified — expired, malformed — is stashed and left to `requireAuth` or to
 * `/auth/refresh`, which accepts a recently expired token on purpose.
 */
export function resolveSession(ctx: Ctx) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = bearerToken(req)
    if (!token) return next()
    const session = req as SessionRequest
    try {
      const claims = await ctx.signer.verify(token)
      const user = await findUser(ctx.db, claims.sub)
      if (!user) throw new HttpError(401, 'unauthorized', 'Unknown account')
      if (Number(claims.ver ?? 1) !== Number(user.token_version ?? 1)) {
        throw new HttpError(401, 'token_revoked', 'This session has ended. Sign in again.')
      }
      if (user.status !== 'approved') throw new HttpError(403, user.status === 'pending' ? 'pending_approval' : user.status, `Account is ${user.status}.`)
      session.claims = claims
    } catch (error) {
      session.authError = error
    }
    next()
  }
}
