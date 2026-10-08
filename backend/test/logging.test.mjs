// Phase 12: structured logging — JSON lines, and no secrets.
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger, defaultLogLevel } from '../src/logging.js'

function capture() {
  const lines = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
  return { lines, logger: createLogger('info', stream) }
}

describe('logging', () => {
  it('defaults to silent under test and info otherwise', () => {
    expect(defaultLogLevel({ NODE_ENV: 'test' })).toBe('silent')
    expect(defaultLogLevel({})).toBe('info')
    expect(defaultLogLevel({ LOG_LEVEL: 'warn' })).toBe('warn')
  })

  it('writes JSON lines tagged with the service', () => {
    const { lines, logger } = capture()
    logger.info({ actor: 'U-agent' }, 'staff signed in')
    const entry = JSON.parse(lines.join(''))
    expect(entry).toMatchObject({ service: 'agroconnect-api', actor: 'U-agent', msg: 'staff signed in', level: 30 })
  })

  it('never writes an authorization header', () => {
    const { lines, logger } = capture()
    logger.info({ req: { headers: { authorization: 'Bearer super-secret-token' } } }, 'request')
    expect(lines.join('')).not.toContain('super-secret-token')
  })
})
