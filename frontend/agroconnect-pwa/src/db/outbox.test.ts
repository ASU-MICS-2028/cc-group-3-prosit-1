import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addToOutbox, listOutbox } from './outbox'

beforeEach(() => db.outbox.clear())

describe('outbox', () => {
  it('saves an item as "saved" with its own client id', async () => {
    const item = await addToOutbox('feedback', { screen: 'home', message: 'Works well', rating: 5, appLanguage: 'en' })
    expect(item).toMatchObject({ kind: 'feedback', status: 'saved' })
    expect(item.clientId).toBeTruthy()
  })

  it('lists one kind at a time, newest first', async () => {
    await addToOutbox('feedback', { screen: 'home', message: 'first', rating: null, appLanguage: 'en' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    await addToOutbox('feedback', { screen: 'home', message: 'second', rating: null, appLanguage: 'en' })
    await addToOutbox('listing', { crop: 'maize', quantityKg: 100, pricePerKg: 5, currency: 'GHS', community: 'Ashaiman' })

    const feedback = await listOutbox('feedback')
    expect(feedback.map((item) => item.payload.message)).toEqual(['second', 'first'])
    expect(await listOutbox('listing')).toHaveLength(1)
  })

  it('keeps a photo with a crop check', async () => {
    await addToOutbox('cropCheck', { crop: 'tomato', note: 'spots', photo: new Blob(['jpeg']) })
    const [item] = await listOutbox('cropCheck')
    expect(item?.payload.photo).toBeInstanceOf(Blob)
  })
})
