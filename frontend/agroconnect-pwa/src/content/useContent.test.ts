import { describe, expect, it } from 'vitest'
import { SAMPLE_ADVICE } from '../data/sampleAdvice'
import { chooseAdvice, choosePrices } from './useContent'

describe('choosePrices', () => {
  it('waits while loading', () => {
    expect(choosePrices({ status: 'loading' }, 'GH')).toBeNull()
  })

  it('uses live prices once any exist, without the sample label', () => {
    const view = choosePrices({ status: 'ready', data: { country: 'GH', updatedOn: '2026-10-08', items: [{ crop: 'maize', price: 5.5, change: 10, recordedOn: '2026-10-08' }] } }, 'GH')
    expect(view).toEqual({ rows: [{ crop: 'maize', price: 5.5, change: 10 }], updatedOn: '2026-10-08', sample: false })
  })

  it('falls back to the labelled samples when nothing is entered or there is no signal and no copy', () => {
    const empty = choosePrices({ status: 'ready', data: { country: 'KE', updatedOn: null, items: [] } }, 'KE')
    expect(empty?.sample).toBe(true)
    expect(empty?.rows).toHaveLength(8)
    expect(choosePrices({ status: 'error', error: new Error('offline') }, 'GH')?.sample).toBe(true)
  })
})

describe('chooseAdvice', () => {
  it('uses published cards, else the samples', () => {
    const card = { id: 'AD-1', crop: 'yam' as const, title: 'Stake early', body: 'Stake vines at 4 weeks.', createdAt: '2026-10-08T10:00:00Z', byName: 'Ama' }
    expect(chooseAdvice({ status: 'ready', data: { items: [card] } })).toEqual({ cards: [card], sample: false })
    expect(chooseAdvice({ status: 'ready', data: { items: [] } })).toEqual({ cards: SAMPLE_ADVICE, sample: true })
  })
})
