import { db } from '../db/db'
import { listPhotosToSend } from '../db/repository'
import { SYNC_STATUS } from '../domain/farmer'

/** Anything a later sync could still send. "Needs attention" items are left out: retrying them cannot help. */
export async function hasUnsent(): Promise<boolean> {
  const [farmers, outbox, photos] = await Promise.all([
    db.farmers.where('status').anyOf(SYNC_STATUS.SAVED, SYNC_STATUS.SENDING).count(),
    db.outbox.filter((item) => item.status === 'saved').count(),
    listPhotosToSend(),
  ])
  return farmers + outbox + photos.length > 0
}
