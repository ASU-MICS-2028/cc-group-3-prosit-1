import { ADMIN_URL, ADVICE_URL, API_URL, LISTINGS_URL, PAYMENTS_URL } from '../config'
import type { OutboxItem, RemoteRef } from '../domain/outbox'
import { jsonPost, send, sendJson } from './send'

export async function postFeedback(item: OutboxItem<'feedback'>): Promise<void> {
  await send(`${ADMIN_URL}/feedback`, jsonPost({ clientId: item.clientId, ...item.payload, createdAt: new Date(item.createdAt).toISOString() }))
}

export function postPayment(item: OutboxItem<'payment'>): Promise<RemoteRef> {
  return sendJson<RemoteRef>(`${PAYMENTS_URL}/payments`, jsonPost({ clientId: item.clientId, ...item.payload }))
}

export function postLoanRequest(item: OutboxItem<'loanRequest'>): Promise<RemoteRef> {
  return sendJson<RemoteRef>(`${PAYMENTS_URL}/loan-requests`, jsonPost({ clientId: item.clientId, ...item.payload }))
}

export function postListing(item: OutboxItem<'listing'>): Promise<RemoteRef> {
  return sendJson<RemoteRef>(`${LISTINGS_URL}/listings`, jsonPost({ clientId: item.clientId, ...item.payload }))
}

/**
 * The text goes first and the photo after, because a weak connection often manages the small request and
 * not the large one. If the photo fails the whole item is tried again, which is safe: both calls are idempotent.
 */
export async function postCropCheck(item: OutboxItem<'cropCheck'>): Promise<RemoteRef> {
  const { crop, note, photo } = item.payload
  const remote = await sendJson<RemoteRef>(`${ADVICE_URL}/crop-checks`, jsonPost({ clientId: item.clientId, crop, note }))
  if (photo) {
    await send(`${ADVICE_URL}/crop-checks/${encodeURIComponent(remote.id)}/photo`, {
      method: 'POST',
      headers: { 'Content-Type': photo.type || 'image/jpeg' },
      body: photo,
    })
  }
  return remote
}

/** A visit logged on the phone (offline first). The clientId makes a repeated send harmless. */
export function postVisit(item: OutboxItem<'visit'>): Promise<RemoteRef> {
  const { farmerId, ...visit } = item.payload
  return sendJson<RemoteRef>(`${API_URL}/farmers/${encodeURIComponent(farmerId)}/visits`, jsonPost({ clientId: item.clientId, ...visit }))
}
