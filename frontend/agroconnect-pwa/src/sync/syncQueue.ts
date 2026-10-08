import {
  getFarmer,
  listEdited,
  listPhotosToSend,
  listUnsent,
  markPhotoRejected,
  markPhotoSent,
  resetStuckSending,
  setStatus,
} from '../db/repository'
import { SYNC_STATUS } from '../domain/farmer'
import { reportHeartbeat } from './heartbeat'
import { scheduleBackgroundSync } from './background'
import { hasUnsent } from './pending'
import { sendOutbox } from './outbox'
import { NetworkError, patchFarmer, postFarmer, postPhoto, RejectedError, ServerError, UnauthorizedError } from './api'

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

async function sendEdits(): Promise<'done' | 'stopped'> {
  for (const farmer of await listEdited()) {
    if (!farmer.serverId) continue
    try {
      await patchFarmer(farmer.serverId, farmer)
      await setStatus(farmer.clientId, SYNC_STATUS.SENT, { errorMessage: null })
    } catch (error) {
      if (error instanceof RejectedError) {
        await setStatus(farmer.clientId, SYNC_STATUS.ATTENTION, { errorMessage: error.message })
        continue
      }
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
  if ((await sendFarmers()) === 'done') {
    // New records have a serverId now, so any pending edits can be patched; photos go last.
    if ((await sendEdits()) === 'done') await sendPhotos()
  }
}

/**
 * The app and the service worker share one IndexedDB queue, so only one of them may send at a time.
 * Holding the lock also means nothing else is mid-upload, which makes it safe to re-queue a record left
 * on "sending" by an app that closed during an upload.
 */
async function withSyncLock(run: () => Promise<void>): Promise<void> {
  if (!navigator.locks) return run()
  await navigator.locks.request('agroconnect-sync', run)
}

/**
 * Sends everything waiting, text first and photos after. Safe to call from anywhere, any
 * number of times: overlapping calls collapse into one run plus one follow-up run.
 * Resolves to whether anything is still waiting to be sent.
 */
export async function requestSync(): Promise<boolean> {
  if (running) {
    runAgain = true
    return true
  }
  if (navigator.onLine) {
    running = true
    try {
      await withSyncLock(async () => {
        await resetStuckSending()
        do {
          runAgain = false
          await syncOnce()
          await sendOutbox()
        } while (runAgain)
      })
      await reportHeartbeat()
    } finally {
      running = false
    }
  }
  const waiting = await hasUnsent()
  if (waiting) await scheduleBackgroundSync()
  return waiting
}

/** Run once when a signed-in user's app opens. */
export async function startSync(): Promise<void> {
  if (started) return
  started = true
  await requestSync()
}
