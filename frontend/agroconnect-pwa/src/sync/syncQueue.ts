import {
  getFarmer,
  listPhotosToSend,
  listUnsent,
  markPhotoRejected,
  markPhotoSent,
  resetStuckSending,
  setStatus,
} from '../db/repository'
import { SYNC_STATUS } from '../domain/farmer'
import { NetworkError, postFarmer, postPhoto, RejectedError, ServerError, UnauthorizedError } from './api'

let running = false
let runAgain = false
let started = false

/** Whether a failure means "stop and try again later" rather than "this record is bad". */
function isTemporary(error: unknown): boolean {
  return error instanceof NetworkError || error instanceof ServerError || error instanceof UnauthorizedError
}

async function sendFarmers(): Promise<'done' | 'stopped'> {
  for (const farmer of await listUnsent()) {
    await setStatus(farmer.clientId, SYNC_STATUS.SENDING)
    try {
      const serverId = await postFarmer(farmer)
      await setStatus(farmer.clientId, SYNC_STATUS.SENT, { serverId, errorMessage: null })
    } catch (error) {
      if (error instanceof RejectedError) {
        await setStatus(farmer.clientId, SYNC_STATUS.ATTENTION, { errorMessage: error.message })
        continue
      }
      await setStatus(farmer.clientId, SYNC_STATUS.SAVED)
      if (isTemporary(error)) return 'stopped'
      throw error
    }
  }
  return 'done'
}

async function sendPhotos(): Promise<void> {
  for (const photo of await listPhotosToSend()) {
    const farmer = await getFarmer(photo.clientId)
    if (!farmer?.serverId) continue
    try {
      await postPhoto(farmer.serverId, photo.blob)
      await markPhotoSent(photo.clientId)
    } catch (error) {
      if (error instanceof RejectedError) {
        await markPhotoRejected(photo.clientId)
        continue
      }
      if (isTemporary(error)) return
      throw error
    }
  }
}

async function syncOnce(): Promise<void> {
  if ((await sendFarmers()) === 'done') await sendPhotos()
}

/**
 * Sends everything waiting, text first and photos after. Safe to call from anywhere, any
 * number of times: overlapping calls collapse into one run plus one follow-up run.
 */
export async function requestSync(): Promise<void> {
  if (!navigator.onLine) return
  if (running) {
    runAgain = true
    return
  }
  running = true
  try {
    do {
      runAgain = false
      await syncOnce()
    } while (runAgain)
  } finally {
    running = false
  }
}

/** Run once when a signed-in staff member's app opens, before anything else touches the queue. */
export async function startSync(): Promise<void> {
  if (started) return
  started = true
  await resetStuckSending()
  await requestSync()
}
