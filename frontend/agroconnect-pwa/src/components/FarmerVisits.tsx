import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { addToOutbox, listOutbox } from '../db/outbox'
import { VISIT_TOPICS, type VisitTopic } from '../domain/outbox'
import { useCachedRemote } from '../hooks/useCachedRemote'
import { useT } from '../i18n/context'
import { requestSync } from '../sync/syncQueue'
import { fetchVisits, isVisitList } from '../visits/visitsApi'
import { Button } from './Button'
import { ChoiceChips } from './ChoiceChips'
import { Field } from './Field'
import { SyncBadge } from './SyncBadge'

interface Row {
  key: string
  visitedAt: string
  topics: VisitTopic[]
  notes: string
  nextVisit: string | null
  by: string | null
  queued: boolean
}

/**
 * The farmer's extension-visit history and a form to log a new visit. Saved on the phone first and sent
 * with the rest of the outbox, so it works in the field without signal (API-CONTRACT "Extension visits").
 */
export function FarmerVisits({ farmerId }: { farmerId: string }) {
  const { t } = useT()
  const load = useCallback(() => fetchVisits(farmerId), [farmerId])
  const { state } = useCachedRemote(`visits:${farmerId}`, load, isVisitList)
  const onPhone = useLiveQuery(() => listOutbox('visit'), []) ?? []

  const [open, setOpen] = useState(false)
  const [topics, setTopics] = useState<VisitTopic[]>([])
  const [notes, setNotes] = useState('')
  const [nextVisit, setNextVisit] = useState('')
  const [error, setError] = useState(false)

  const fromServer = state.status === 'ready' ? state.data.items : []
  const known = new Set(fromServer.map((visit) => visit.clientId))
  const rows: Row[] = [
    ...fromServer.map((visit) => ({ key: visit.clientId, visitedAt: visit.visitedAt, topics: visit.topics, notes: visit.notes, nextVisit: visit.nextVisit, by: visit.agentName, queued: false })),
    ...onPhone
      .filter((item) => item.payload.farmerId === farmerId && !known.has(item.clientId))
      .map((item) => ({ key: item.clientId, ...item.payload, by: null, queued: item.status !== 'sent' })),
  ].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))

  async function save() {
    if (topics.length === 0) return setError(true)
    await addToOutbox('visit', { farmerId, visitedAt: new Date().toISOString(), topics, notes: notes.trim(), nextVisit: nextVisit || null })
    setTopics([])
    setNotes('')
    setNextVisit('')
    setError(false)
    setOpen(false)
    void requestSync()
  }

  return (
    <section className="card">
      <h2 className="card-title">{t('visits.title')}</h2>
      {rows.length === 0 && <p>{t('visits.none')}</p>}
      <ul className="plain-list">
        {rows.map((row) => (
          <li key={row.key} className="list-item visit-row">
            <span>
              <strong>{new Date(row.visitedAt).toLocaleDateString([], { dateStyle: 'medium' })}</strong> · {row.topics.map((topic) => t(`visits.topic.${topic}`)).join(', ')}
            </span>
            {row.notes && <span>{row.notes}</span>}
            <span className="farmer-meta">
              {row.by && t('visits.by', { name: row.by })}
              {row.nextVisit && ` ${t('visits.next', { date: new Date(row.nextVisit).toLocaleDateString([], { dateStyle: 'medium' }) })}`}
            </span>
            {row.queued && <SyncBadge status="saved" />}
          </li>
        ))}
      </ul>

      {open ? (
        <div className="form">
          <ChoiceChips legend="visits.topics" hint="reg.cropsHint" options={VISIT_TOPICS} prefix="visits.topic" value={topics} onChange={(v) => setTopics(v as VisitTopic[])} />
          {error && (
            <p className="error" role="alert">
              {t('visits.topicsRequired')}
            </p>
          )}
          <Field label={t('visits.notes')} htmlFor="visit-notes">
            <textarea id="visit-notes" className="input" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label={t('visits.nextVisit')} htmlFor="visit-next">
            <input id="visit-next" className="input" type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} />
          </Field>
          <Button variant="main" onClick={() => void save()}>
            {t('visits.save')}
          </Button>
          <Button variant="text" className="on-card" onClick={() => setOpen(false)}>
            {t('coordinators.cancel')}
          </Button>
        </div>
      ) : (
        <Button onClick={() => setOpen(true)}>{t('visits.log')}</Button>
      )}
    </section>
  )
}
