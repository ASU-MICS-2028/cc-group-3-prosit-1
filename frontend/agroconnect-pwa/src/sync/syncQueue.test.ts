import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { getFarmer, newDraft, saveDraft, saveFarmer } from '../db/repository'
import { SYNC_STATUS } from '../domain/farmer'

vi.mock('./heartbeat', () => ({ reportHeartbeat: vi.fn() }))
vi.mock('./outbox', () => ({ sendOutbox: vi.fn() }))

vi.mock('./api', async () => {
  class NetworkError extends Error {}
  class ServerError extends Error {}
  class RejectedError extends Error {}
  class UnauthorizedError extends Error {}
  return { NetworkError, ServerError, RejectedError, UnauthorizedError, postFarmer: vi.fn(), postPhoto: vi.fn() }
})

const api = await import('./api')
const { requestSync, startSync } = await import('./syncQueue')
const postFarmer = vi.mocked(api.postFarmer)
const postPhoto = vi.mocked(api.postPhoto)

async function register(name: string, photo: Blob | null = null) {
  const draft = { ...newDraft(), name, phone: '0241234567', consent: true, photo }
  await saveDraft(draft)
  await saveFarmer(draft)
  await new Promise((resolve) => setTimeout(resolve, 2))
  return draft.clientId
}

beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('navigator', { onLine: true })
  await Promise.all([db.farmers.clear(), db.drafts.clear(), db.photos.clear()])
})

describe('requestSync', () => {
  it('marks a farmer "sent" and stores the server id', async () => {
    const id = await register('Ama')
    postFarmer.mockResolvedValue('srv-1')
    await requestSync()
    expect(await getFarmer(id)).toMatchObject({ status: SYNC_STATUS.SENT, serverId: 'srv-1' })
  })

  it('does nothing while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const id = await register('Ama')
    await requestSync()
    expect(postFarmer).not.toHaveBeenCalled()
    expect((await getFarmer(id))?.status).toBe(SYNC_STATUS.SAVED)
  })

  it('keeps a record as "saved" and stops when the network fails', async () => {
    const first = await register('A')
    const second = await register('B')
    postFarmer.mockRejectedValue(new api.NetworkError('offline'))
    await requestSync()
    expect(postFarmer).toHaveBeenCalledTimes(1)
    expect((await getFarmer(first))?.status).toBe(SYNC_STATUS.SAVED)
    expect((await getFarmer(second))?.status).toBe(SYNC_STATUS.SAVED)
  })

  it('flags a rejected record and carries on with the next', async () => {
    const bad = await register('Bad')
    const good = await register('Good')
    postFarmer.mockRejectedValueOnce(new api.RejectedError('Phone already registered')).mockResolvedValueOnce('srv-2')
    await requestSync()
    expect(await getFarmer(bad)).toMatchObject({ status: SYNC_STATUS.ATTENTION, errorMessage: 'Phone already registered' })
    expect((await getFarmer(good))?.status).toBe(SYNC_STATUS.SENT)
  })

  it('does not retry a record that needs attention', async () => {
    await register('Bad')
    postFarmer.mockRejectedValue(new api.RejectedError('no'))
    await requestSync()
    await requestSync()
    expect(postFarmer).toHaveBeenCalledTimes(1)
  })

  it('sends the photo only after the text data is sent', async () => {
    const id = await register('Kofi', new Blob(['jpeg']))
    postFarmer.mockResolvedValue('srv-3')
    await requestSync()
    expect(postPhoto).toHaveBeenCalledWith('srv-3', expect.any(Blob))
    expect((await db.photos.get(id))?.sent).toBe(true)
  })

  it('does not send photos when the text data failed', async () => {
    await register('Kofi', new Blob(['jpeg']))
    postFarmer.mockRejectedValue(new api.NetworkError('offline'))
    await requestSync()
    expect(postPhoto).not.toHaveBeenCalled()
  })

  it('stops retrying a photo the server rejected', async () => {
    const id = await register('Kofi', new Blob(['jpeg']))
    postFarmer.mockResolvedValue('srv-4')
    postPhoto.mockRejectedValue(new api.RejectedError('too large'))
    await requestSync()
    await requestSync()
    expect(postPhoto).toHaveBeenCalledTimes(1)
    expect((await db.photos.get(id))?.rejected).toBe(true)
  })
})

describe('startSync', () => {
  it('re-queues a record left on "sending" and sends it', async () => {
    const id = await register('Ama')
    await db.farmers.update(id, { status: SYNC_STATUS.SENDING })
    postFarmer.mockResolvedValue('srv-5')
    await startSync()
    expect((await getFarmer(id))?.status).toBe(SYNC_STATUS.SENT)
  })
})
