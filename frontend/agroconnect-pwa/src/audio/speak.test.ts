import { describe, expect, it } from 'vitest'
import { chooseSource } from './speak'

const voices = [{ lang: 'en-US' }, { lang: 'en-GH' }, { lang: 'fr-FR' }]

describe('chooseSource', () => {
  it('prefers a recorded clip', () => {
    expect(chooseSource('tw', 'reg.consent', voices, { en: [], tw: ['reg.consent'], ee: [] })).toEqual({ kind: 'clip', url: '/audio/tw/reg.consent.mp3' })
  })

  it('uses the phone voice for the language, Ghanaian English first', () => {
    expect(chooseSource('en', 'reg.consent', voices, { en: [], tw: [], ee: [] })).toMatchObject({ kind: 'voice', lang: 'en-GH' })
  })

  it('stays silent rather than reading Twi or Ewe in another language', () => {
    expect(chooseSource('tw', 'reg.consent', voices, { en: [], tw: [], ee: [] })).toBeNull()
    expect(chooseSource('ee', null, voices, { en: [], tw: [], ee: [] })).toBeNull()
  })

  it('finds an Akan voice for Twi when the phone has one', () => {
    expect(chooseSource('tw', null, [{ lang: 'ak-GH' }])).toMatchObject({ kind: 'voice', lang: 'ak-GH' })
  })
})
