import { describe, expect, it } from 'vitest'
import type { CropCheckView } from '../domain/advice'
import type { OutboxItem } from '../domain/outbox'
import { buildCheckRows } from './merge'

const local = (clientId: string, overrides: Partial<OutboxItem<'cropCheck'>> = {}): OutboxItem<'cropCheck'> => ({
  clientId,
  kind: 'cropCheck',
  payload: { crop: 'tomato', note: 'Spots', photo: null },
  status: 'saved',
  createdAt: 1_000,
  ...overrides,
})

const server = (clientId: string, overrides: Partial<CropCheckView> = {}): CropCheckView => ({
  id: `CC-${clientId}`,
  clientId,
  crop: 'tomato',
  note: 'Spots',
  status: 'open',
  createdAt: new Date(5_000).toISOString(),
  farmerName: 'Ama',
  farmerPhone: '+233241234567',
  hasPhoto: false,
  advice: null,
  ...overrides,
})

describe('buildCheckRows', () => {
  it('shows a check that was not sent as queued', () => {
    expect(buildCheckRows([local('a')], [])[0]).toMatchObject({ state: 'queued', advice: null })
  })

  it('shows a refused check as needing attention, with the reason', () => {
    expect(buildCheckRows([local('a', { status: 'attention', errorMessage: 'Too long' })], [])[0]).toMatchObject({ state: 'attention', message: 'Too long' })
  })

  it('shows a sent check as open until the server says it is answered', () => {
    expect(buildCheckRows([local('a', { status: 'sent' })], [])[0]?.state).toBe('open')
  })

  it('takes the answer from the server, with the advice text', () => {
    const answered = server('a', { status: 'answered', advice: { text: 'Spray copper', by: 'Efua', at: 'now' } })
    const rows = buildCheckRows([local('a', { status: 'sent' })], [answered])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: 'answered', advice: { text: 'Spray copper' } })
  })

  it('puts the newest first, mixing both sources', () => {
    expect(buildCheckRows([local('new', { createdAt: 9_000 })], [server('old')]).map((row) => row.clientId)).toEqual(['new', 'old'])
  })
})
