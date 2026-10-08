export const SYNC_STATUS = {
  SAVED: 'saved',
  SENDING: 'sending',
  SENT: 'sent',
  ATTENTION: 'attention',
  /** A farmer already on the server has been edited on the phone and is waiting to be patched. */
  EDITED: 'edited',
} as const
export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS]

export const CROP_IDS = ['maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain'] as const
export type CropId = (typeof CROP_IDS)[number]

export const FARMER_LANGUAGES = ['en', 'tw', 'ee', 'dag'] as const
export type FarmerLanguage = (typeof FARMER_LANGUAGES)[number]

export const GENDERS = ['female', 'male', 'undisclosed'] as const
export type Gender = (typeof GENDERS)[number]

export const isCropId = (value: string): value is CropId => (CROP_IDS as readonly string[]).includes(value)
export const isFarmerLanguage = (value: string): value is FarmerLanguage => (FARMER_LANGUAGES as readonly string[]).includes(value)
export const isGender = (value: string): value is Gender => (GENDERS as readonly string[]).includes(value)

import type { FarmerProfile } from './profile'

export type RegistrationStep = 1 | 2 | 3 | 4

export interface GpsFix {
  lat: number
  lng: number
  /** Metres. Smaller is better. */
  accuracy: number
  capturedAt: number
}

export interface RegistrationFields {
  name: string
  phone: string
  preferredLanguage: FarmerLanguage
  /** Optional. Records saved before this field existed have none. */
  gender?: Gender | null
  community: string
  region: string
  /** Text while editing, so "2." and "" are valid mid-typing states. */
  farmSizeAcres: string
  crops: CropId[]
  gps: GpsFix | null
  consent: boolean
  /** Optional answers about farm, phone, money and needs. Records saved before it existed have none. */
  profile?: FarmerProfile
}

export interface Draft extends RegistrationFields {
  /** Generated on the phone so the record has an ID before the server has seen it. */
  clientId: string
  step: RegistrationStep
  photo: Blob | null
  updatedAt?: number
}

export interface Farmer extends RegistrationFields {
  clientId: string
  /** The photo itself is in its own table so listing farmers never loads image data. */
  hasPhoto: boolean
  status: SyncStatus
  serverId: string | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

export interface StoredPhoto {
  clientId: string
  blob: Blob
  sent: boolean
  /** The server refused this photo; it is not retried automatically. */
  rejected?: boolean
}
