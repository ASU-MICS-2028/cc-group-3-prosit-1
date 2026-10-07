import { authedJson } from '../auth/authedRequest'
import { PAYMENTS_URL } from '../config'
import type { PaymentView, Wallet } from '../domain/payments'

export const fetchWallet = (): Promise<Wallet> => authedJson<Wallet>(`${PAYMENTS_URL}/payments/me`)

export const fetchPayment = (id: string): Promise<PaymentView> =>
  authedJson<PaymentView>(`${PAYMENTS_URL}/payments/${encodeURIComponent(id)}`)

/** For agents and coordinators: `recordId` is the farmer's server id, not their login account's id. */
export const fetchFarmerPayments = (recordId: string): Promise<Wallet> =>
  authedJson<Wallet>(`${PAYMENTS_URL}/farmers/${encodeURIComponent(recordId)}/payments`)
