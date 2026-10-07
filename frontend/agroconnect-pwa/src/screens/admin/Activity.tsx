import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { listAudit } from '../../admin/adminApi'
import { useRemote } from '../../hooks/useRemote'
import { useT } from '../../i18n/context'

export function Activity() {
  const { t } = useT()
  const { state, reload } = useRemote(listAudit)

  return (
    <>
      <ScreenHeader title={t('activity.title')} />
      <main className="screen-body">
        <section className="card">
          <h2 className="card-title">{t('activity.audit')}</h2>
          <RemoteView state={state} onRetry={reload}>
            {(entries) =>
              entries.length === 0 ? (
                <p>{t('activity.empty')}</p>
              ) : (
                <ul className="plain-list">
                  {entries.slice(0, 30).map((entry) => (
                    <li key={`${entry.at}-${entry.action}-${entry.targetId}`} className="list-item">
                      <span>
                        <strong>{entry.action}</strong>
                        <br />
                        {entry.targetId} · {entry.actorRole}
                      </span>
                      <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    </li>
                  ))}
                </ul>
              )
            }
          </RemoteView>
        </section>

        {(['activity.feedback', 'activity.cropChecks'] as const).map((key) => (
          <section key={key} className="card">
            <h2 className="card-title">{t(key)}</h2>
            <p>{t('activity.later')}</p>
          </section>
        ))}
      </main>
    </>
  )
}
