import type { Currency } from './country'
import type { CropId } from './farmer'
import type { PaymentDirection, PaymentNetwork } from './payments'

export interface FeedbackPayload {
  screen: string
  message: string
  rating: number | null
  appLanguage: string
}

export interface ListingPayload {
  crop: CropId
  quantityKg: number
  pricePerKg: number
  currency: Currency
  community: string
}

export interface CropCheckPayload {
  crop: CropId
  note: string
  photo: Blob | null
}

export interface PaymentPayload {
  direction: PaymentDirection
  amount: number
  currency: Currency
  network: PaymentNetwork
  /** E.164 */
  phone: string
}

export interface LoanRequestPayload {
  amount: number
  currency: Currency
  purpose: string
}

export const VISIT_TOPICS = ['advice', 'inputs', 'pests', 'market', 'training', 'credit', 'records', 'follow_up'] as const
export type VisitTopic = (typeof VISIT_TOPICS)[number]

/** An extension agent's visit to a farmer the server already has (API-CONTRACT "Extension visits"). */
export interface VisitPayload {
  /** The farmer's server id. */
  farmerId: string
  /** ISO 8601, when the visit happened on the phone. */
  visitedAt: string
  topics: VisitTopic[]
  notes: string
  /** YYYY-MM-DD, or null. */
  nextVisit: string | null
}

export interface PayloadByKind {
  feedback: FeedbackPayload
  listing: ListingPayload
  cropCheck: CropCheckPayload
  payment: PaymentPayload
  loanRequest: LoanRequestPayload
  visit: VisitPayload
}

export type OutboxKind = keyof PayloadByKind

/** What the server said back, for items that have a life after they are sent (a payment is pending, then final). */
export interface RemoteRef {
  id: string
  status: string
  /** For a payment: the provider's checkout page, while it is pending. */
  checkoutUrl?: string | null
}

/** Something the user created offline that will be sent to the server later. */
export interface OutboxItem<K extends OutboxKind = OutboxKind> {
  clientId: string
  kind: K
  payload: PayloadByKind[K]
  status: 'saved' | 'sent' | 'attention'
  createdAt: number
  errorMessage?: string
  remote?: RemoteRef
}

/** The same item as a union, so a `switch` on `kind` knows which payload it holds. */
export type AnyOutboxItem = { [K in OutboxKind]: OutboxItem<K> }[OutboxKind]

export const SENDABLE_KINDS = ['feedback', 'payment', 'loanRequest', 'listing', 'cropCheck', 'visit'] as const satisfies readonly OutboxKind[]
