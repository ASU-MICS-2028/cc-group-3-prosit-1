import { v4 as uuid } from 'uuid'
import { EMPTY_PROFILE } from '../domain/profile'
import { SYNC_STATUS, type Draft, type Farmer, type RegistrationFields, type StoredPhoto, type SyncStatus } from '../domain/farmer'
import { db } from './db'

type CarryOver = Pick<RegistrationFields, 'community' | 'region'>

export function newDraft(carryOver: Partial<CarryOver> = {}): Draft {
  return {
    clientId: uuid(),
    step: 1,
    name: '',
    phone: '',
    preferredLanguage: 'en',
    gender: null,
    community: carryOver.community ?? '',
    region: carryOver.region ?? '',
    farmSizeAcres: '',
    crops: [],
    gps: null,
    photo: null,
    consent: false,
    profile: EMPTY_PROFILE,
  }
}

export async function saveDraft(draft: Draft): Promise<void> {
  await db.drafts.put({ ...draft, updatedAt: Date.now() })
}

export function getLatestDraft(): Promise<Draft | undefined> {
  return db.drafts.orderBy('updatedAt').last()
}

export function discardDraft(clientId: string): Promise<void> {
  return db.drafts.delete(clientId)
}

/** Moves a draft into `farmers` and removes the draft in one transaction. */
export async function saveFarmer(draft: Draft): Promise<Farmer> {
  const { photo } = draft
  const now = Date.now()
  const farmer: Farmer = {
    clientId: draft.clientId,
    name: draft.name,
    phone: draft.phone,
    preferredLanguage: draft.preferredLanguage,
    gender: draft.gender ?? null,
    community: draft.community,
    region: draft.region,
    farmSizeAcres: draft.farmSizeAcres,
    crops: draft.crops,
    gps: draft.gps,
    consent: draft.consent,
    profile: draft.profile ?? EMPTY_PROFILE,
    hasPhoto: photo !== null,
    status: SYNC_STATUS.SAVED,
    serverId: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction('rw', db.farmers, db.drafts, db.photos, async () => {
    await db.farmers.put(farmer)
    if (photo) await db.photos.put({ clientId: farmer.clientId, blob: photo, sent: false })
    await db.drafts.delete(farmer.clientId)
  })
  return farmer
}

export function listFarmers(): Promise<Farmer[]> {
  return db.farmers.orderBy('createdAt').reverse().toArray()
}

export function getFarmer(clientId: string): Promise<Farmer | undefined> {
  return db.farmers.get(clientId)
}

export function getPhoto(clientId: string): Promise<StoredPhoto | undefined> {
  return db.photos.get(clientId)
}

type StatusDetails = Partial<Pick<Farmer, 'serverId' | 'errorMessage'>>

export async function setStatus(clientId: string, status: SyncStatus, details: StatusDetails = {}): Promise<void> {
  await db.farmers.update(clientId, { status, updatedAt: Date.now(), ...details })
}

/** "Needs attention" records are excluded: retrying a rejection automatically would never succeed. */
export function listUnsent(): Promise<Farmer[]> {
  return db.farmers.where('status').equals(SYNC_STATUS.SAVED).sortBy('createdAt')
}

/**
 * Saves an edit to a farmer. Before its first sync the create carries the change; afterwards it waits as an
 * "edited" record for the next sync to PATCH.
 */
export async function updateFarmer(clientId: string, changes: Partial<RegistrationFields>): Promise<void> {
  const farmer = await db.farmers.get(clientId)
  if (!farmer) return
  await db.farmers.update(clientId, {
    ...changes,
    status: farmer.serverId ? SYNC_STATUS.EDITED : SYNC_STATUS.SAVED,
    errorMessage: null,
    updatedAt: Date.now(),
  })
}

/** Farmers edited after they reached the server, oldest edit first. */
export function listEdited(): Promise<Farmer[]> {
  return db.farmers.where('status').equals(SYNC_STATUS.EDITED).sortBy('updatedAt')
}

/** A record left on "sending" means the app closed mid-upload. */
export async function resetStuckSending(): Promise<void> {
  await db.farmers.where('status').equals(SYNC_STATUS.SENDING).modify({ status: SYNC_STATUS.SAVED })
}

export async function listPhotosToSend(): Promise<StoredPhoto[]> {
  const sent = new Set(await db.farmers.where('status').equals(SYNC_STATUS.SENT).primaryKeys())
  return db.photos.filter((photo) => !photo.sent && !photo.rejected && sent.has(photo.clientId)).toArray()
}

export async function markPhotoSent(clientId: string): Promise<void> {
  await db.photos.update(clientId, { sent: true })
}

export async function markPhotoRejected(clientId: string): Promise<void> {
  await db.photos.update(clientId, { rejected: true })
}
