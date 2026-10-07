import { authedRequest } from '../auth/authedRequest'
import { RejectedError, ServerError } from '../lib/http'

/** Rate limiting means "slow down", which for a queue is the same as "try again later". */
export async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await authedRequest(url, init)
  } catch (error) {
    if (error instanceof RejectedError && error.status === 429) throw new ServerError(error.message)
    throw error
  }
}

export async function sendJson<T>(url: string, init: RequestInit): Promise<T> {
  return (await send(url, init)).json() as Promise<T>
}

export const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
