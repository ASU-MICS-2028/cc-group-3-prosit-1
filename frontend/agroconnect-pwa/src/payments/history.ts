import type { Currency } from '../domain/country'
import type { OutboxItem } from '../domain/outbox'
import type { PaymentDirection, PaymentNetwork, PaymentView } from '../domain/payments'

/**
 * queued: saved on the phone, not sent yet (never shown as paid)
 * attention: the server refused it
 * pending: the server has it and is waiting for the farmer to approve the prompt
 */
export type HistoryState = 'queued' | 'attention' | 'pending' | 'successful' | 'failed'

export interface HistoryRow {
  clientId: string
  direction: PaymentDirection
  amount: number
  currency: Currency
  network: PaymentNetwork
  state: HistoryState
  at: number
  message?: string
  /** Where the farmer finishes a pending payment (the provider's checkout page). */
  checkoutUrl?: string
}

function fromServer(payment: PaymentView): HistoryRow {
  return {
    clientId: payment.clientId,
    direction: payment.direction,
    amount: payment.amount,
    currency: payment.currency,
    network: payment.network,
    state: payment.status,
    at: Date.parse(payment.createdAt),
    ...(payment.status === 'pending' && payment.checkoutUrl && { checkoutUrl: payment.checkoutUrl }),
  }
}

function fromPhone(item: OutboxItem<'payment'>): HistoryRow {
  const { direction, amount, currency, network } = item.payload
  const base = { clientId: item.clientId, direction, amount, currency, network, at: item.createdAt }
  if (item.status === 'attention') return { ...base, state: 'attention', message: item.errorMessage }
  if (item.status === 'sent') {
    const pending = item.remote?.status === 'pending' || !item.remote
    return { ...base, state: pending ? 'pending' : (item.remote?.status as HistoryState), ...(pending && item.remote?.checkoutUrl && { checkoutUrl: item.remote.checkoutUrl }) }
  }
  return { ...base, state: 'queued' }
}

/** The server's list is the truth. Requests the server has not reported yet are added from the phone's own copy. */
export function buildHistory(onPhone: readonly OutboxItem<'payment'>[], fromServerList: readonly PaymentView[]): HistoryRow[] {
  const known = new Set(fromServerList.map((payment) => payment.clientId))
  return [...fromServerList.map(fromServer), ...onPhone.filter((item) => !known.has(item.clientId)).map(fromPhone)].sort((a, b) => b.at - a.at)
}
