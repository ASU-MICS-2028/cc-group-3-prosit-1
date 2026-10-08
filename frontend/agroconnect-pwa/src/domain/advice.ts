import type { CropId } from './farmer'

export const MAX_NOTE_LENGTH = 500
export const MAX_ADVICE_LENGTH = 500

export type CropCheckStatus = 'open' | 'answered'

export interface Advice {
  text: string
  by: string
  at: string
}

export interface CropCheckView {
  id: string
  clientId: string
  crop: CropId
  note: string
  status: CropCheckStatus
  createdAt: string
  farmerName: string
  farmerPhone: string
  hasPhoto: boolean
  advice: Advice | null
}

export const isCropCheckList = (value: unknown): value is CropCheckView[] => Array.isArray(value)
