import { pino, type Logger } from 'pino'

/**
 * JSON logs for CloudWatch. The level comes from LOG_LEVEL, defaulting to "silent" under test so the
 * suite's output stays readable, and "info" everywhere else.
 */
export function defaultLogLevel(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LOG_LEVEL) return env.LOG_LEVEL
  return env.NODE_ENV === 'test' ? 'silent' : 'info'
}

/** Authorization headers and cookies never belong in a log line; everything else is structured JSON. */
export function createLogger(level: string = defaultLogLevel()): Logger {
  return pino({
    level,
    base: { service: 'agroconnect-api' },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
  })
}

export const logger = createLogger()
