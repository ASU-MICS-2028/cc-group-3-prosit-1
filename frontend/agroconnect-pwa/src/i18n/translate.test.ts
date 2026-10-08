import { describe, expect, it } from 'vitest'
import ee from './ee.json'
import en from './en.json'
import { translate } from './translate'
import tw from './tw.json'

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

describe('translations', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it.each([['tw', tw], ['ee', ee]] as const)('%s only uses English keys and keeps their placeholders', (_, dictionary) => {
    for (const [key, text] of Object.entries(dictionary)) {
      expect(en).toHaveProperty([key])
      expect(placeholders(text), key).toEqual(placeholders(en[key as keyof typeof en]))
    }
  })
})
