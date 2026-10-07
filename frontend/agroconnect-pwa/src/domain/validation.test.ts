import { describe, expect, it } from 'vitest'
import type { RegistrationFields } from './farmer'
import {
  cleanPhone,
  firstStepWithError,
  isValidPhone,
  normaliseFields,
  parsePositiveNumber,
  parseFarmSize,
  validateAll,
  validateStep,
} from './validation'

const valid: RegistrationFields = {
  name: 'Ama Mensah',
  phone: '024 123 4567',
  preferredLanguage: 'tw',
  community: 'Ashaiman',
  region: 'Greater Accra',
  farmSizeAcres: '2.5',
  crops: ['maize'],
  gps: null,
  consent: true,
}

describe('phone numbers', () => {
  it.each(['0241234567', '024 123 4567', '024-123-4567', '+233241234567', '233241234567'])(
    'accepts %s',
    (phone) => expect(isValidPhone(phone)).toBe(true),
  )

  it.each(['', '024123456', '02412345678', '+1 555 123 4567', 'abcdefghij'])(
    'rejects %j',
    (phone) => expect(isValidPhone(phone)).toBe(false),
  )

  it('strips spaces, dashes and brackets', () => {
    expect(cleanPhone('(024) 123-4567')).toBe('0241234567')
  })
})

describe('farm size', () => {
  it('parses whole and decimal numbers, with a point or a comma', () => {
    expect(parseFarmSize('3')).toBe(3)
    expect(parseFarmSize('2.5')).toBe(2.5)
    expect(parseFarmSize('2,5')).toBe(2.5)
  })

  it('rejects anything else', () => {
    expect(parseFarmSize('two')).toBeNull()
    expect(parseFarmSize('-1')).toBeNull()
    expect(parseFarmSize('')).toBeNull()
  })
})

describe('validateStep', () => {
  it('requires a name and a phone in step 1', () => {
    expect(validateStep(1, { ...valid, name: '  ', phone: '12' })).toEqual({
      name: 'nameRequired',
      phone: 'phoneInvalid',
    })
  })

  it('allows an empty farm size but not a bad one', () => {
    expect(validateStep(2, { ...valid, farmSizeAcres: '' })).toEqual({})
    expect(validateStep(2, { ...valid, farmSizeAcres: 'big' })).toEqual({ farmSize: 'farmSizeInvalid' })
  })

  it('requires consent in step 3', () => {
    expect(validateStep(3, { ...valid, consent: false })).toEqual({ consent: 'consentRequired' })
  })

  it('treats photo and GPS as optional', () => {
    expect(validateAll(valid)).toEqual({})
  })
})

describe('firstStepWithError', () => {
  it('points at the earliest step with a problem', () => {
    expect(firstStepWithError({ consent: 'consentRequired', phone: 'phoneInvalid' })).toBe(1)
    expect(firstStepWithError({ farmSize: 'farmSizeInvalid', consent: 'consentRequired' })).toBe(2)
    expect(firstStepWithError({ consent: 'consentRequired' })).toBe(3)
  })
})

describe('normaliseFields', () => {
  it('trims text and tidies the phone and farm size', () => {
    const result = normaliseFields({ ...valid, name: '  Ama ', phone: '024 123 4567', farmSizeAcres: ' 2,5 ' })
    expect(result).toMatchObject({ name: 'Ama', phone: '0241234567', farmSizeAcres: '2.5' })
  })
})

describe('parsePositiveNumber', () => {
  it('accepts positive numbers with a point or a comma', () => {
    expect(parsePositiveNumber('12')).toBe(12)
    expect(parsePositiveNumber(' 2,5 ')).toBe(2.5)
  })

  it('rejects zero, negatives and text', () => {
    expect(parsePositiveNumber('0')).toBeNull()
    expect(parsePositiveNumber('-3')).toBeNull()
    expect(parsePositiveNumber('abc')).toBeNull()
    expect(parsePositiveNumber('')).toBeNull()
  })
})
