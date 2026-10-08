const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export class HttpError extends Error {
  constructor(status, code, message = code, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/** A string or Buffer body is sent as-is (CSV, an image); anything else is sent as JSON. `extraHeaders` can override the type. */
export function send(res, status, body, extraHeaders = {}) {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    res.writeHead(status, { ...CORS_HEADERS, ...extraHeaders })
    return res.end(body)
  }
  const headers = body === undefined ? CORS_HEADERS : { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  res.writeHead(status, headers)
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

export async function readBuffer(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export async function readJson(req) {
  const raw = await readBuffer(req)
  if (raw.length === 0) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body must be JSON')
  }
}

function compile(path) {
  const pattern = path.replace(/:(\w+)/g, '(?<$1>[^/]+)')
  return new RegExp(`^${pattern}$`)
}

/** Routes are [method, path, handler]; a handler returns [status, body] or throws an HttpError. */
export function createRouter(routes) {
  const compiled = routes.map(([method, path, handler]) => ({ method, matcher: compile(path), handler }))

  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const done = (status, body, headers) => {
      console.log(`${req.method} ${url.pathname} -> ${status}`)
      send(res, status, body, headers)
    }

    if (req.method === 'OPTIONS') return done(204)

    try {
      for (const { method, matcher, handler } of compiled) {
        const match = method === req.method && matcher.exec(url.pathname)
        if (!match) continue
        const [status, body, headers] = await handler({ req, res, params: match.groups ?? {}, query: url.searchParams })
        return done(status, body, headers)
      }
      done(404, { error: 'not_found', message: 'Not found' })
    } catch (error) {
      if (error instanceof HttpError) {
        return done(error.status, { error: error.code, message: error.message, ...error.details })
      }
      console.error(error)
      done(500, { error: 'server_error', message: 'Unexpected error' })
    }
  }
}
