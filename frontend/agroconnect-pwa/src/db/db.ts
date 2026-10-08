import Dexie, { type EntityTable } from 'dexie'
import type { Session } from '../domain/auth'
import type { Draft, Farmer, StoredPhoto } from '../domain/farmer'
import type { AnyOutboxItem } from '../domain/outbox'

export const db = new Dexie('agroconnect') as Dexie & {
  farmers: EntityTable<Farmer, 'clientId'>
  drafts: EntityTable<Draft, 'clientId'>
  photos: EntityTable<StoredPhoto, 'clientId'>
  session: EntityTable<Session, 'key'>
  outbox: EntityTable<AnyOutboxItem, 'clientId'>
}

db.version(1).stores({
  farmers: 'clientId, status, createdAt, phone',
  drafts: 'clientId, updatedAt',
  photos: 'clientId',
})

db.version(2).stores({
  session: 'key',
})

db.version(3).stores({
  outbox: 'clientId, kind, createdAt',
})
