import { useCallback, useState } from 'react'
import { Button } from '../../components/Button'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useRemote } from '../../hooks/useRemote'
import { useT } from '../../i18n/context'
import type { TranslationKey } from '../../i18n/translate'
import { fetchRequests, markRequestDone } from '../../requests/requestsApi'

/** Requests from feature-phone farmers (USSD) to be visited, for coordinators and admins to follow up. */
export function Requests({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const [status, setStatus] = useState<'open' | 'done'>('open')
  const load = useCallback(() => fetchRequests(status), [status])
  const { state, reload } = useRemote(load)
  const [busy, setBusy] = useState<string | null>(null)

  async function done(id: string) {
    setBusy(id)
    try {
      await markRequestDone(id)
      reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <ScreenHeader title={t('requests.title')} subtitle={t('requests.hint')} onBack={onBack} />
      <main className="screen-body">
        <div className="pill-row" role="tablist">
          {(['open', 'done'] as const).map((tab) => (
            <button key={tab} type="button" role="tab" className={tab === status ? 'pill is-selected' : 'pill'} aria-selected={tab === status} onClick={() => setStatus(tab)}>
              {t(`requests.tab.${tab}`)}
            </button>
          ))}
        </div>
        {state.status === 'loading' && <p>{t('common.loading')}</p>}
        {state.status === 'error' && (
          <>
            <p className="note">{t('common.needsSignal')}</p>
            <Button onClick={reload}>{t('common.retry')}</Button>
          </>
        )}
        {state.status === 'ready' && state.data.items.length === 0 && <p className="note">{t('requests.none')}</p>}
        {state.status === 'ready' &&
          state.data.items.map((request) => (
            <article key={request.id} className="card">
              <p className="card-title">{request.farmer ? request.farmer.name : t('requests.unregistered')}</p>
              <p className="farmer-meta">
                {t('requests.kind.agent_visit')} · {t(`requests.channel.${request.channel}`)}
                {request.language ? ` · ${t(`lang.${request.language}` as TranslationKey)}` : ''} ·{' '}
                {new Date(request.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              <p>
                <a href={`tel:${request.phone}`}>{request.phone}</a>
                {request.farmer?.community ? ` · ${request.farmer.community}` : ''}
              </p>
              {request.status === 'open' ? (
                <Button disabled={busy === request.id} onClick={() => void done(request.id)}>
                  {t('requests.markDone')}
                </Button>
              ) : (
                <p className="farmer-meta">{t('requests.doneBy', { name: request.handledBy ?? '' })}</p>
              )}
            </article>
          ))}
      </main>
    </>
  )
}
