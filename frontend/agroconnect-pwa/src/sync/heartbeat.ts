import { authedJson } from '../auth/authedRequest'
import { ADMIN_URL } from '../config'
import { db } from '../db/db'
import { SYNC_STATUS } from '../domain/farmer'

const RESEND_AFTER_MS = 10 * 60_000

export interface Heartbeat {
  pending: number
  attention: number
  lastSyncAt: string | null
  appVersion: string
}

export async function collectHeartbeat(): Promise<Heartbeat> {
  const [pending, attention, sent] = await Promise.all([
    db.farmers.where('status').anyOf(SYNC_STATUS.SAVED, SYNC_STATUS.SENDING).count(),
    db.farmers.where('status').equals(SYNC_STATUS.ATTENTION).count(),
    db.farmers.where('status').equals(SYNC_STATUS.SENT).toArray(),
  ])
  const latest = sent.reduce((newest, farmer) => Math.max(newest, farmer.updatedAt), 0)
  return { pending, attention, lastSyncAt: latest ? new Date(latest).toISOString() : null, appVersion: __APP_VERSION__ }
}

const signature = (beat: Heartbeat) => `${beat.pending}/${beat.attention}/${beat.lastSyncAt}`

interface LastSent {
  signature: string
  at: number
}

/** Send when something changed, or every 10 minutes, so a phone on paid data is not chatty. */
export function shouldSendHeartbeat(last: LastSent | null, next: Heartbeat, now: number): boolean {
  return !last || last.signature !== signature(next) || now - last.at >= RESEND_AFTER_MS
}

let lastSent: LastSent | null = null
let enabled = false

/** Only agents and coordinators report to the admin's sync overview; for other roles the server would just refuse. */
export function setHeartbeatEnabled(value: boolean): void {
  enabled = value
}

/** Best effort: a failed heartbeat must never get in the way of syncing, and is simply tried again next run. */
export async function reportHeartbeat(now = Date.now()): Promise<void> {
  if (!enabled) return
  try {
    const beat = await collectHeartbeat()
    if (!shouldSendHeartbeat(lastSent, beat, now)) return
    await authedJson(`${ADMIN_URL}/agents/me/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(beat),
    })
    lastSent = { signature: signature(beat), at: now }
  } catch {
    // Offline, signed out or the server is down: nothing to do.
  }
}
