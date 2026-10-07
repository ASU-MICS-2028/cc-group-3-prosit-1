import type { Advice, CropCheckView } from '../domain/advice'
import type { OutboxItem } from '../domain/outbox'
import type { CropId } from '../domain/farmer'

/**
 * queued: saved on the phone, not sent yet
 * attention: the server refused it
 * open: the server has it and no extension officer has answered
 */
export type CheckState = 'queued' | 'attention' | 'open' | 'answered'

export interface CheckRow {
  clientId: string
  crop: CropId
  note: string
  state: CheckState
  at: number
  advice: Advice | null
  message?: string
}

function fromServer(check: CropCheckView): CheckRow {
  return { clientId: check.clientId, crop: check.crop, note: check.note, state: check.status, at: Date.parse(check.createdAt), advice: check.advice }
}

function fromPhone(item: OutboxItem<'cropCheck'>): CheckRow {
  const base = { clientId: item.clientId, crop: item.payload.crop, note: item.payload.note, at: item.createdAt, advice: null }
  if (item.status === 'attention') return { ...base, state: 'attention', message: item.errorMessage }
  return { ...base, state: item.status === 'sent' ? 'open' : 'queued' }
}

/** The server's list is the truth. Checks it has not reported yet are added from the phone's own copy. */
export function buildCheckRows(onPhone: readonly OutboxItem<'cropCheck'>[], fromServerList: readonly CropCheckView[]): CheckRow[] {
  const known = new Set(fromServerList.map((check) => check.clientId))
  return [...fromServerList.map(fromServer), ...onPhone.filter((item) => !known.has(item.clientId)).map(fromPhone)].sort((a, b) => b.at - a.at)
}
