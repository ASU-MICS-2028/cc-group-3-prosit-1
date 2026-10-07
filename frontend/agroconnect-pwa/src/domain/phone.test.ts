import { describe, expect, it } from 'vitest'
import { splitPhone, toE164 } from './phone'

describe('splitPhone', () => {
  it.each(['0241234567', '024 123 4567', '024-123-4567', '233241234567', '+233241234567', '+233 24 123 4567'])(
    'splits %s into +233 and 241234567',
    (input) => expect(splitPhone(input)).toEqual({ countryCode: '+233', phoneNational: '241234567' }),
  )

  it.each(['', '024123456', '02412345678', '+2330241234567', '+1 555 123 4567', 'abc'])('rejects %j', (input) =>
    expect(splitPhone(input)).toBeNull(),
  )

  it('never leaves a leading zero in the national part', () => {
    expect(splitPhone('0241234567')?.phoneNational.startsWith('0')).toBe(false)
  })
})

describe('toE164', () => {
  it('joins the two parts', () => {
    expect(toE164('0241234567')).toBe('+233241234567')
  })

  it('gives the same result however the number was typed', () => {
    expect(toE164('024 123 4567')).toBe(toE164('+233241234567'))
  })

  it('returns null for an invalid number', () => {
    expect(toE164('12')).toBeNull()
  })
})
