import { authedJson, authedRequest } from '../auth/authedRequest'
import { ADMIN_URL } from '../config'
import { requestJson } from '../lib/http'
import { jsonPost } from '../sync/send'

/** The server's VAPID public key, or null when notifications are off there (404). */
export async function fetchPushKey(): Promise<string | null> {
  try {
    return (await requestJson<{ publicKey: string }>(`${ADMIN_URL}/push/key`)).publicKey
  } catch {
    return null
  }
}

export const saveSubscription = (subscription: PushSubscriptionJSON) => authedJson(`${ADMIN_URL}/push/subscriptions`, jsonPost(subscription))

export const deleteSubscription = (endpoint: string) => authedRequest(`${ADMIN_URL}/push/subscriptions/delete`, jsonPost({ endpoint }))

/** VAPID keys travel as base64url; pushManager.subscribe wants the raw bytes. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
