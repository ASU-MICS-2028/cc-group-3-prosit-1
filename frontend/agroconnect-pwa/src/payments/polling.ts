import { listPendingPayments, updateRemoteStatus } from '../db/outbox'
import type { PaymentStatus } from '../domain/payments'

/**
 * Asks the server how each waiting payment is going and records any that have settled.
 * Stops quietly at the first failed request, because that usually means the signal is gone.
 */
export async function refreshPendingPayments(fetchStatus: (id: string) => Promise<PaymentStatus>): Promise<{ changed: number; stillPending: number }> {
  let changed = 0
  for (const item of await listPendingPayments()) {
    if (!item.remote) continue
    try {
      const status = await fetchStatus(item.remote.id)
      if (status !== 'pending') {
        await updateRemoteStatus(item.clientId, status)
        changed += 1
      }
    } catch {
      break
    }
  }
  return { changed, stillPending: (await listPendingPayments()).length }
}
