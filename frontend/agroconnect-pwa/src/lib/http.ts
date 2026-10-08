const REQUEST_TIMEOUT_MS = 15_000

/** No connection, or it dropped. Normal in the field. */
export class NetworkError extends Error {}

/** The server is failing or too slow (5xx, 408). Worth retrying later. */
export class ServerError extends Error {}

/** There is no signed-in session to authorise the request with. */
export class UnauthorizedError extends Error {}

/** The server refused the request (4xx). Retrying the same request cannot help. */
export class RejectedError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'request_rejected',
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

interface ErrorBody {
  error?: string
  message?: string
  [key: string]: unknown
}

async function readFailure(response: Response): Promise<{ code: string; message: string; details: ErrorBody }> {
  try {
    const { error, message, ...details } = (await response.json()) as ErrorBody
    return { code: error ?? 'request_rejected', message: message ?? error ?? `Server replied ${response.status}`, details }
  } catch {
    return { code: 'request_rejected', message: `Server replied ${response.status}`, details: {} }
  }
}

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch {
    throw new NetworkError(`Could not reach ${new URL(url).origin}`)
  } finally {
    clearTimeout(timer)
  }

  if (response.ok) return response
  const { code, message, details } = await readFailure(response)
  if (response.status >= 500 || response.status === 408) throw new ServerError(message)
  throw new RejectedError(message, response.status, code, details)
}

export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await request(url, init)
  return (response.status === 204 ? undefined : await response.json()) as T
}
