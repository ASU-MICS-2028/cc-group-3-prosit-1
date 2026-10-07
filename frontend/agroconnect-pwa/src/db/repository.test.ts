import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SYNC_STATUS } from '../domain/farmer'
import { db } from './db'
import {
  getLatestDraft,
  getPhoto,
  listFarmers,
  listPhotosToSend,
  listUnsent,
  markPhotoSent,
  newDraft,
  resetStuckSending,
  saveDraft,
  saveFarmer,
  setStatus,
} from './repository'

async function register(name: string, photo: Blob | null = null) {
  const draft = { ...newDraft(), name, phone: '0241234567', consent: true, photo }
  await saveDraft(draft)
  await saveFarmer(draft)
  return draft.clientId
}

beforeEach(async () => {
  await Promise.all([db.farmers.clear(), db.drafts.clear(), db.photos.clear()])
})

describe('drafts', () => {
  it('keeps the most recently changed draft', async () => {
    const older = { ...newDraft(), name: 'Older' }
    await saveDraft(older)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await saveDraft({ ...newDraft(), name: 'Newer' })
    expect((await getLatestDraft())?.name).toBe('Newer')
  })

  it('carries community and region into the next draft', () => {
    expect(newDraft({ community: 'Ashaiman', region: 'Greater Accra' })).toMatchObject({
      community: 'Ashaiman',
      region: 'Greater Accra',
      name: '',
    })
  })
})

describe('saveFarmer', () => {
  it('moves the draft into farmers as "saved" and removes the draft', async () => {
    await register('Ama')
    expect(await db.drafts.count()).toBe(0)
    const [farmer] = await listFarmers()
    expect(farmer).toMatchObject({ name: 'Ama', status: SYNC_STATUS.SAVED, serverId: null, hasPhoto: false })
  })

  it('stores the photo separately from the farmer row', async () => {
    const id = await register('Kofi', new Blob(['jpeg']))
    const [farmer] = await listFarmers()
    expect(farmer).not.toHaveProperty('photo')
    expect(farmer?.hasPhoto).toBe(true)
    expect(await getPhoto(id)).toBeDefined()
  })

  it('lists newest first', async () => {
    await register('First')
    await new Promise((resolve) => setTimeout(resolve, 2))
    await register('Second')
    expect((await listFarmers()).map((f) => f.name)).toEqual(['Second', 'First'])
  })
})

describe('sync queue', () => {
  it('lists only "saved" records, oldest first', async () => {
    const first = await register('A')
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = await register('B')
    await new Promise((resolve) => setTimeout(resolve, 2))
    const third = await register('C')
    await setStatus(second, SYNC_STATUS.ATTENTION, { errorMessage: 'rejected' })
    await setStatus(third, SYNC_STATUS.SENT)
    expect((await listUnsent()).map((f) => f.clientId)).toEqual([first])
  })

  it('puts records stuck on "sending" back in the queue', async () => {
    const id = await register('A')
    await setStatus(id, SYNC_STATUS.SENDING)
    await resetStuckSending()
    expect((await listUnsent()).map((f) => f.clientId)).toEqual([id])
  })

  it('offers a photo only after its farmer has been sent', async () => {
    const id = await register('A', new Blob(['jpeg']))
    expect(await listPhotosToSend()).toHaveLength(0)
    await setStatus(id, SYNC_STATUS.SENT)
    expect(await listPhotosToSend()).toHaveLength(1)
    await markPhotoSent(id)
    expect(await listPhotosToSend()).toHaveLength(0)
  })
})
