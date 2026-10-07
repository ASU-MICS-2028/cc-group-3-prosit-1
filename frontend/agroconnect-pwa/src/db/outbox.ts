import { v4 as uuid } from 'uuid'
import type { OutboxItem, OutboxKind, PayloadByKind } from '../domain/outbox'
import { db } from './db'

export async function addToOutbox<K extends OutboxKind>(kind: K, payload: PayloadByKind[K]): Promise<OutboxItem<K>> {
  const item: OutboxItem<K> = { clientId: uuid(), kind, payload, status: 'saved', createdAt: Date.now() }
  await db.outbox.put(item as OutboxItem)
  return item
}

export async function listOutbox<K extends OutboxKind>(kind: K): Promise<OutboxItem<K>[]> {
  const items = await db.outbox.where('kind').equals(kind).sortBy('createdAt')
  return (items as OutboxItem<K>[]).reverse()
}
