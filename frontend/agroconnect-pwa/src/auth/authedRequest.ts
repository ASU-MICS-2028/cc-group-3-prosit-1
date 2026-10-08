import { blockingNotice, type SignOutNotice } from '../domain/auth'
import { RejectedError, request, UnauthorizedError } from '../lib/http'

export interface TokenProvider {
  getToken: () => string | null
  /** Resolves to a fresh token, or null if none could be obtained. */
  refresh: () => Promise<string | null>
  /** The server has ended the session (revoked, suspended, rejected): lock the user out now. */
  blocked?: (notice: SignOutNotice) => void
}

let provider: TokenProvider | null = null

export function setTokenProvider(next: TokenProvider | null): void {
  provider = next
}

function withToken(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

/** Sends the signed-in user's token, and on a 401 refreshes it and retries once. */
export async function authedRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const token = provider?.getToken()
  if (!token) throw new UnauthorizedError('Not signed in')

  try {
    return await request(url, withToken(init, token))
  } catch (error) {
    if (!(error instanceof RejectedError)) throw error
    // The server has already ended the session; do not try to refresh it, just lock out.
    if (error.status === 401 && error.code === 'token_revoked') {
      provider?.blocked?.('revoked')
      throw new UnauthorizedError('Session ended')
    }
    if (error.status === 403) {
      const notice = blockingNotice(error.code)
      if (notice) provider?.blocked?.(notice)
      throw error
    }
    if (error.status !== 401) throw error
    const fresh = await provider?.refresh()
    if (!fresh) throw new UnauthorizedError('Session expired')
    return request(url, withToken(init, fresh))
  }
}

export async function authedJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await authedRequest(url, init)
  return (response.status === 204 ? undefined : await response.json()) as T
}
