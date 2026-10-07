import { describe, expect, it } from 'vitest'
import { RejectedError } from './http'
import { e164OrReject } from './phoneInput'

describe('e164OrReject', () => {
  it('converts what was typed to the international form', () => {
    expect(e164OrReject('024 123 4567')).toBe('+233241234567')
  })

  it('refuses a bad number as a rejection, so no request is sent', () => {
    expect(() => e164OrReject('12')).toThrow(RejectedError)
    expect(() => e164OrReject('12')).toThrow(expect.objectContaining({ status: 400, code: 'invalid_request', details: { field: 'phone' } }))
  })
})
