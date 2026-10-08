import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { pgError } from './db.js'

/** Becomes `{ error: code, message, ...details }` with `status`, the error shape every contract uses. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export const invalid = (field: string, message: string) => new HttpError(400, 'invalid_request', message, { field })
export const notFound = (what: string) => new HttpError(404, 'not_found', `Unknown ${what}`)

export interface RouteInput {
  req: Request
  params: Record<string, string>
  query: URLSearchParams
}

/** A handler returns [status, body, headers?]. A Buffer or string body is sent as-is, anything else as JSON. */
export type RouteResult = [number, unknown?, Record<string, string>?]
export type Handler = (input: RouteInput) => Promise<RouteResult>

export function route(handler: Handler): RequestHandler {
  return async (req, res) => {
    const query = new URL(req.originalUrl, 'http://local').searchParams
    const [status, body, headers = {}] = await handler({ req, params: req.params as Record<string, string>, query })
    res.status(status).set(headers)
    if (body === undefined) res.end()
    else if (Buffer.isBuffer(body) || typeof body === 'string') res.send(body)
    else res.json(body)
  }
}

/** The parsed JSON body, or {} when there was none (as the mock's readJson). */
export const jsonBody = (req: Request): Record<string, any> =>
  req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {}

/** SQLSTATEs that mean "the request carried a bad value", whatever constraint caught it. */
const BAD_VALUE_CODES = new Set(['23502', '23514', '22P02', '22003', '22007', '22008', '22023'])

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.code, message: error.message, ...error.details })
    return
  }
  const type = (error as { type?: string }).type
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'too_large', message: 'The request body is too large' })
    return
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json', message: 'Body must be JSON' })
    return
  }
  const db = pgError(error)
  if (db && BAD_VALUE_CODES.has(db.code)) {
    res.status(400).json({ error: 'invalid_request', message: 'Some of the data is not valid', ...(db.constraint && { constraint: db.constraint }) })
    return
  }
  console.error('[http] unexpected error', error)
  res.status(500).json({ error: 'server_error', message: 'Unexpected error' })
}
