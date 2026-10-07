import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { addToOutbox } from '../db/outbox'

vi.mock('./api', () => {
  class NetworkError extends Error {}
  class ServerError extends Error {}
  class RejectedError extends Error {}
  class UnauthorizedError extends Error {}
  return { NetworkError, ServerError, RejectedError, UnauthorizedError }
})
vi.mock('./outboxApi', () => ({ postFeedback: vi.fn(), postPayment: vi.fn(), postLoanRequest: vi.fn(), postListing: vi.fn(), postCropCheck: vi.fn() }))

const api = await import('./api')
const outboxApi = await import('./outboxApi')
const { sendOutbox } = await import('./outbox')
const postFeedback = vi.mocked(outboxApi.postFeedback)
const postPayment = vi.mocked(outboxApi.postPayment)
const postLoanRequest = vi.mocked(outboxApi.postLoanRequest)
const postListing = vi.mocked(outboxApi.postListing)
const postCropCheck = vi.mocked(outboxApi.postCropCheck)

const feedback = (message: string) => addToOutbox('feedback', { screen: 'home', message, rating: null, appLanguage: 'en' })
const payment = () => addToOutbox('payment', { direction: 'payout', amount: 40, currency: 'GHS', network: 'mtn', phone: '+233241234567' })
const stored = (clientId: string) => db.outbox.get(clientId)
const pause = () => new Promise((resolve) => setTimeout(resolve, 2))

beforeEach(async () => {
  vi.resetAllMocks()
  await db.outbox.clear()
})

describe('sendOutbox', () => {
  it('sends feedback and marks it sent', async () => {
    const item = await feedback('Works well')
    await sendOutbox()
    expect(postFeedback).toHaveBeenCalledTimes(1)
    expect((await stored(item.clientId))?.status).toBe('sent')
  })

  it('keeps what the server answered for a payment, so it can be followed up', async () => {
    const item = await payment()
    postPayment.mockResolvedValue({ id: 'P-9', status: 'pending' })
    await sendOutbox()
    expect(await stored(item.clientId)).toMatchObject({ status: 'sent', remote: { id: 'P-9', status: 'pending' } })
  })

  it('sends a loan request', async () => {
    await addToOutbox('loanRequest', { amount: 500, currency: 'GHS', purpose: 'Seed' })
    postLoanRequest.mockResolvedValue({ id: 'L-1', status: 'received' })
    await sendOutbox()
    expect(postLoanRequest).toHaveBeenCalledTimes(1)
  })

  it('marks a refused item as needing attention and carries on with the next', async () => {
    const bad = await feedback('x')
    await pause()
    const good = await payment()
    postFeedback.mockRejectedValue(new api.RejectedError('Message too short'))
    postPayment.mockResolvedValue({ id: 'P-1', status: 'pending' })

    await sendOutbox()
    expect(await stored(bad.clientId)).toMatchObject({ status: 'attention', errorMessage: 'Message too short' })
    expect((await stored(good.clientId))?.status).toBe('sent')
  })

  it('stops and leaves everything queued when the connection is lost', async () => {
    const first = await payment()
    await pause()
    const second = await feedback('later')
    postPayment.mockRejectedValue(new api.NetworkError('offline'))

    await sendOutbox()
    expect(postFeedback).not.toHaveBeenCalled()
    expect((await stored(first.clientId))?.status).toBe('saved')
    expect((await stored(second.clientId))?.status).toBe('saved')
  })

  it('does not send the same item twice, and does not retry one that needs attention', async () => {
    await feedback('once')
    postFeedback.mockRejectedValueOnce(new api.RejectedError('no')).mockResolvedValue(undefined)
    await sendOutbox()
    await sendOutbox()
    expect(postFeedback).toHaveBeenCalledTimes(1)
  })

  it('sends a produce listing and keeps the server\'s id so it can be closed later', async () => {
    const listing = await addToOutbox('listing', { crop: 'maize', quantityKg: 10, pricePerKg: 5, currency: 'GHS', community: 'Ashaiman' })
    postListing.mockResolvedValue({ id: 'LS-1', status: 'open' })
    await sendOutbox()
    expect(await stored(listing.clientId)).toMatchObject({ status: 'sent', remote: { id: 'LS-1', status: 'open' } })
  })

  it('sends a crop check, and leaves it queued if its photo could not be sent', async () => {
    const check = await addToOutbox('cropCheck', { crop: 'tomato', note: 'Spots', photo: new Blob(['jpeg']) })
    postCropCheck.mockRejectedValueOnce(new api.NetworkError('dropped during the photo'))
    await sendOutbox()
    expect((await stored(check.clientId))?.status).toBe('saved')

    postCropCheck.mockResolvedValueOnce({ id: 'CC-1', status: 'open' })
    await sendOutbox()
    expect(await stored(check.clientId)).toMatchObject({ status: 'sent', remote: { id: 'CC-1' } })
  })
})
