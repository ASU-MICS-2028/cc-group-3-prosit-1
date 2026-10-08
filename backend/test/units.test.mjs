// Phase 15: unit tests for the pure helpers that the integration suite only exercises indirectly.
import { describe, expect, it } from 'vitest'
import { isE164, isUuid, sha256 } from '../src/security.ts'
import { accraDay, csvCell, csvResponse, dateRange, inRange } from '../src/time.ts'

describe('phone and id validation', () => {
  it('accepts E.164 and rejects local formats', () => {
    expect(isE164('+233241234567')).toBe(true)
    expect(isE164('0241234567')).toBe(false)
    expect(isE164('+233')).toBe(false)
    expect(isE164(undefined)).toBe(false)
  })

  it('accepts UUIDs only', () => {
    expect(isUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
    expect(isUuid('c-1')).toBe(false)
  })

  it('hashes deterministically', () => {
    expect(sha256('123456')).toBe(sha256('123456'))
    expect(sha256('123456')).not.toBe(sha256('654321'))
  })
})

describe('Ghana time', () => {
  it('formats the calendar day in Africa/Accra', () => {
    expect(accraDay('2026-10-07T23:30:00Z')).toBe('2026-10-07')
    expect(accraDay(new Date('2026-10-08T00:30:00Z'))).toBe('2026-10-08')
  })

  it('parses a date range and refuses anything else', () => {
    const range = dateRange(new URLSearchParams('from=2026-10-01&to=2026-10-07'))
    expect(range).toEqual({ from: '2026-10-01', to: '2026-10-07' })
    expect(() => dateRange(new URLSearchParams('from=07/10/2026'))).toThrow(/Dates must look like/)
  })

  it('filters days within the range', () => {
    const range = { from: '2026-10-01', to: '2026-10-07' }
    expect(inRange('2026-10-03', range)).toBe(true)
    expect(inRange('2026-09-30', range)).toBe(false)
    expect(inRange('2026-10-08', range)).toBe(false)
  })
})

describe('CSV', () => {
  it('neutralises spreadsheet formulas and quotes separators', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('Ama, Mensah')).toBe('"Ama, Mensah"')
    expect(csvCell('plain')).toBe('plain')
    // Numeric columns are not prefixed, so a negative coordinate survives.
    expect(csvCell('-0.03', true)).toBe('-0.03')
  })

  it('builds a BOM-prefixed CRLF download', () => {
    const [status, body, headers] = csvResponse('x.csv', ['a', 'b'], ['b'], [{ a: 'x', b: 1 }])
    expect(status).toBe(200)
    expect(body.startsWith('\ufeff')).toBe(true)
    expect(body).toContain('a,b')
    expect(body).toContain('x,1')
    expect(headers['Content-Disposition']).toContain('x.csv')
  })
})
