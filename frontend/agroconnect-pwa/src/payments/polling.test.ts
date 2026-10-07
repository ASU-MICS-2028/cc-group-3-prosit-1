import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { addToOutbox, markOutboxSent } from '../db/outbox'
import type { PaymentStatus } from '../domain/payments'
import { refreshPendingPayments } from './polling'

async function waitingPayment(remoteId: string) {
  const item = await addToOutbox('payment', { direction: 'collect', amount: 10, currency: 'GHS', network: 'mtn', phone: '+233241234567' })
  await markOutboxSent(item.clientId, { id: remoteId, status: 'pending' })
  return item.clientId
}

const remoteStatusOf = async (clientId: string) => (await db.outbox.get(clientId))?.remote?.status

beforeEach(() => db.outbox.clear())

describe('refreshPendingPayments', () => {
  it('records the payments that have settled and counts the ones still waiting', async () => {
    const done = await waitingPayment('P-1')
    const waiting = await waitingPayment('P-2')
    const statuses: Record<string, PaymentStatus> = { 'P-1': 'successful', 'P-2': 'pending' }

    const result = await refreshPendingPayments(async (id) => statuses[id] ?? 'pending')
    expect(result).toEqual({ changed: 1, stillPending: 1 })
    expect(await remoteStatusOf(done)).toBe('successful')
    expect(await remoteStatusOf(waiting)).toBe('pending')
  })

  it('stops quietly when a request fails, and leaves everything as it was', async () => {
    const id = await waitingPayment('P-1')
    await waitingPayment('P-2')
    let calls = 0
    const result = await refreshPendingPayments(async () => {
      calls += 1
      throw new Error('no signal')
    })
    expect(calls).toBe(1)
    expect(result).toEqual({ changed: 0, stillPending: 2 })
    expect(await remoteStatusOf(id)).toBe('pending')
  })

  it('does nothing when no payment is waiting', async () => {
    expect(await refreshPendingPayments(async () => 'successful')).toEqual({ changed: 0, stillPending: 0 })
  })
})
