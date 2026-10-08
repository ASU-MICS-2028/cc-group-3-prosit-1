import { v4 as uuid } from 'uuid'
import type { AnyOutboxItem, OutboxItem, OutboxKind, PayloadByKind, RemoteRef } from '../domain/outbox'
import { db } from './db'

export async function addToOutbox<K extends OutboxKind>(kind: K, payload: PayloadByKind[K]): Promise<OutboxItem<K>> {
  const item: OutboxItem<K> = { clientId: uuid(), kind, payload, status: 'saved', createdAt: Date.now() }
  await db.outbox.put(item as AnyOutboxItem)
  return item
}

export async function listOutbox<K extends OutboxKind>(kind: K): Promise<OutboxItem<K>[]> {
  const items = await db.outbox.where('kind').equals(kind).sortBy('createdAt')
  return (items as OutboxItem<K>[]).reverse()
}

export function listOutboxToSend(kinds: readonly OutboxKind[]): Promise<AnyOutboxItem[]> {
  return db.outbox
    .where('kind')
    .anyOf(kinds)
    .filter((item) => item.status === 'saved')
    .sortBy('createdAt')
}

export async function markOutboxSent(clientId: string, remote?: RemoteRef): Promise<void> {
  await db.outbox.update(clientId, { status: 'sent', ...(remote && { remote }) })
}

export async function markOutboxAttention(clientId: string, errorMessage: string): Promise<void> {
  await db.outbox.update(clientId, { status: 'attention', errorMessage })
}

export function listPendingPayments(): Promise<OutboxItem<'payment'>[]> {
  return db.outbox
    .where('kind')
    .equals('payment')
    .filter((item) => item.status === 'sent' && item.remote?.status === 'pending')
    .toArray() as Promise<OutboxItem<'payment'>[]>
}

export async function updateRemoteStatus(clientId: string, status: string): Promise<void> {
  const item = await db.outbox.get(clientId)
  if (item?.remote) await db.outbox.update(clientId, { remote: { ...item.remote, status } })
}
