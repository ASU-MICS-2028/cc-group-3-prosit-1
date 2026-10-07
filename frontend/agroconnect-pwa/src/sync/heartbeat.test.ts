import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { newDraft, saveDraft, saveFarmer, setStatus } from '../db/repository'
import { SYNC_STATUS } from '../domain/farmer'
import { collectHeartbeat, shouldSendHeartbeat, type Heartbeat } from './heartbeat'

async function register(name: string) {
  const draft = { ...newDraft(), name, phone: '0241234567', consent: true }
  await saveDraft(draft)
  await saveFarmer(draft)
  return draft.clientId
}

beforeEach(() => Promise.all([db.farmers.clear(), db.drafts.clear(), db.photos.clear()]))

describe('collectHeartbeat', () => {
  it('counts what is waiting and what needs attention', async () => {
    const waiting = await register('A')
    const sending = await register('B')
    const refused = await register('C')
    await setStatus(sending, SYNC_STATUS.SENDING)
    await setStatus(refused, SYNC_STATUS.ATTENTION)
    expect(waiting).toBeTruthy()

    expect(await collectHeartbeat()).toMatchObject({ pending: 2, attention: 1, lastSyncAt: null })
  })

  it('reports the time of the latest successful send', async () => {
    const id = await register('A')
    await setStatus(id, SYNC_STATUS.SENT)
    const { lastSyncAt, pending } = await collectHeartbeat()
    expect(pending).toBe(0)
    expect(lastSyncAt && Date.parse(lastSyncAt)).toBeGreaterThan(Date.now() - 5_000)
  })

  it('carries the app version', async () => {
    expect((await collectHeartbeat()).appVersion).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('shouldSendHeartbeat', () => {
  const beat: Heartbeat = { pending: 2, attention: 0, lastSyncAt: null, appVersion: '1.0.0' }
  const sent = { signature: '2/0/null', at: 1_000_000 }

  it('sends the first one', () => {
    expect(shouldSendHeartbeat(null, beat, 1_000_000)).toBe(true)
  })

  it('stays quiet when nothing changed recently', () => {
    expect(shouldSendHeartbeat(sent, beat, 1_000_000 + 60_000)).toBe(false)
  })

  it('sends when a count changes', () => {
    expect(shouldSendHeartbeat(sent, { ...beat, pending: 3 }, 1_000_000 + 1_000)).toBe(true)
  })

  it('sends again after ten minutes even if nothing changed', () => {
    expect(shouldSendHeartbeat(sent, beat, 1_000_000 + 10 * 60_000)).toBe(true)
  })
})

describe('reportHeartbeat', () => {
  async function freshModule() {
    vi.resetModules()
    vi.doMock('../auth/authedRequest', () => ({ authedJson: vi.fn(async () => undefined) }))
    const sent = (await import('../auth/authedRequest')).authedJson as ReturnType<typeof vi.fn>
    return { sent, heartbeat: await import('./heartbeat') }
  }

  it('sends nothing for a role that is not an agent or coordinator', async () => {
    const { sent, heartbeat } = await freshModule()
    await heartbeat.reportHeartbeat()
    expect(sent).not.toHaveBeenCalled()
  })

  it('sends the counts once enabled, then stays quiet until something changes', async () => {
    const { sent, heartbeat } = await freshModule()
    const id = await register('A')
    heartbeat.setHeartbeatEnabled(true)

    await heartbeat.reportHeartbeat(1_000_000)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sent.mock.calls[0]?.[1].body)).toMatchObject({ pending: 1, attention: 0 })

    await heartbeat.reportHeartbeat(1_000_000 + 60_000)
    expect(sent).toHaveBeenCalledTimes(1)

    await setStatus(id, SYNC_STATUS.SENT)
    await heartbeat.reportHeartbeat(1_000_000 + 120_000)
    expect(sent).toHaveBeenCalledTimes(2)
  })

  it('stops sending when disabled again, for example after signing out', async () => {
    const { sent, heartbeat } = await freshModule()
    heartbeat.setHeartbeatEnabled(true)
    heartbeat.setHeartbeatEnabled(false)
    await heartbeat.reportHeartbeat()
    expect(sent).not.toHaveBeenCalled()
  })
})
