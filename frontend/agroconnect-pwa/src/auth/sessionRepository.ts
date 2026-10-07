import { db } from '../db/db'
import type { Session } from '../domain/auth'

export function getSession(): Promise<Session | undefined> {
  return db.session.get('current')
}

export async function saveSession(session: Session): Promise<void> {
  await db.session.put(session)
}

export async function clearSession(): Promise<void> {
  await db.session.clear()
}
