import { describe, expect, it } from 'vitest'
import type { OutboxItem } from '../domain/outbox'
import type { PaymentView } from '../domain/payments'
import { buildHistory } from './history'

const local = (clientId: string, overrides: Partial<OutboxItem<'payment'>> = {}): OutboxItem<'payment'> => ({
  clientId,
  kind: 'payment',
  payload: { direction: 'collect', amount: 50, currency: 'GHS', network: 'mtn', phone: '+233241234567' },
  status: 'saved',
  createdAt: 1_000,
  ...overrides,
})

const server = (clientId: string, overrides: Partial<PaymentView> = {}): PaymentView => ({
  id: `P-${clientId}`,
  clientId,
  direction: 'payout',
  amount: 200,
  currency: 'GHS',
  network: 'mtn',
  phone: '+233241234567',
  status: 'successful',
  createdAt: new Date(5_000).toISOString(),
  ...overrides,
})

describe('buildHistory', () => {
  it('shows a request that has not been sent as queued, never as paid', () => {
    expect(buildHistory([local('a')], [])).toMatchObject([{ clientId: 'a', state: 'queued' }])
  })

  it('shows a request the server refused as needing attention, with the reason', () => {
    const row = buildHistory([local('a', { status: 'attention', errorMessage: 'Amount too large' })], [])[0]
    expect(row).toMatchObject({ state: 'attention', message: 'Amount too large' })
  })

  it('shows a sent request as waiting for approval until the server says otherwise', () => {
    const sent = local('a', { status: 'sent', remote: { id: 'P-1', status: 'pending' } })
    expect(buildHistory([sent], [])[0]?.state).toBe('pending')
    const settled = local('a', { status: 'sent', remote: { id: 'P-1', status: 'successful' } })
    expect(buildHistory([settled], [])[0]?.state).toBe('successful')
  })

  it('trusts the server over the phone when both know the payment', () => {
    const rows = buildHistory([local('a', { status: 'sent', remote: { id: 'P-1', status: 'pending' } })], [server('a', { status: 'failed', direction: 'collect' })])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: 'failed', direction: 'collect' })
  })

  it('puts the newest first, mixing both sources', () => {
    const rows = buildHistory([local('new', { createdAt: 9_000 })], [server('old')])
    expect(rows.map((row) => row.clientId)).toEqual(['new', 'old'])
  })
})
