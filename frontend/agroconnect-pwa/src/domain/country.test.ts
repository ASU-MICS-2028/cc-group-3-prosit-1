import { describe, expect, it } from 'vitest'
import { formatMoney } from './country'

describe('formatMoney', () => {
  it('uses the right symbol for each country', () => {
    expect(formatMoney(25.5, 'GH')).toBe('₵ 25.50')
    expect(formatMoney(1200, 'NG')).toBe('₦ 1,200')
    expect(formatMoney(55, 'KE')).toBe('KSh 55')
  })
})
