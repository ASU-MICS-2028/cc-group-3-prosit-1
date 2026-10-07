import type { CropId } from './farmer'

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
  currency: string
  community: string
}

export interface CropCheckPayload {
  crop: CropId
  note: string
  photo: Blob | null
}

export interface PayloadByKind {
  feedback: FeedbackPayload
  listing: ListingPayload
  cropCheck: CropCheckPayload
}

export type OutboxKind = keyof PayloadByKind

/** Something the user created offline that will be sent to the server later. */
export interface OutboxItem<K extends OutboxKind = OutboxKind> {
  clientId: string
  kind: K
  payload: PayloadByKind[K]
  status: 'saved' | 'sent' | 'attention'
  createdAt: number
}
