import { RejectedError, request, UnauthorizedError } from '../lib/http'

export interface TokenProvider {
  getToken: () => string | null
  /** Resolves to a fresh token, or null if none could be obtained. */
  refresh: () => Promise<string | null>
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
    if (!(error instanceof RejectedError && error.status === 401)) throw error
    const fresh = await provider?.refresh()
    if (!fresh) throw new UnauthorizedError('Session expired')
    return request(url, withToken(init, fresh))
  }
}

export async function authedJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await authedRequest(url, init)
  return (response.status === 204 ? undefined : await response.json()) as T
}
