/**
 * One JSON object per line on stdout/stderr, so CloudWatch Logs Insights can filter by level, component
 * and requestId (e.g. `fields @timestamp, msg | filter level = "error"`). Never pass request bodies:
 * they hold phone numbers, PINs and passwords.
 */
type Level = 'info' | 'warn' | 'error'

function write(level: Level, component: string, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, component, msg, ...fields })
  if (level === 'info') process.stdout.write(`${line}\n`)
  else process.stderr.write(`${line}\n`)
}

export const log = {
  info: (component: string, msg: string, fields?: Record<string, unknown>) => write('info', component, msg, fields),
  warn: (component: string, msg: string, fields?: Record<string, unknown>) => write('warn', component, msg, fields),
  error: (component: string, msg: string, fields?: Record<string, unknown>) => write('error', component, msg, fields),
}

/** Error details safe to log: the message, name and stack, never the object's own fields. */
export const describeError = (error: unknown) =>
  error instanceof Error ? { error: error.message, errorName: error.name, stack: error.stack } : { error: String(error) }
