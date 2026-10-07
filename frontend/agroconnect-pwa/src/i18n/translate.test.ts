import { describe, expect, it } from 'vitest'
import { translate } from './translate'

describe('translate', () => {
  it('returns the English text', () => {
    expect(translate('en', 'nav.home')).toBe('Home')
  })

  it('fills in placeholders', () => {
    expect(translate('en', 'reg.stepOf', { step: 2, total: 3 })).toBe('Step 2 of 3')
  })

  it('leaves a placeholder empty when no value is given', () => {
    expect(translate('en', 'reg.stepOf', { step: 2 })).toBe('Step 2 of ')
  })
})
