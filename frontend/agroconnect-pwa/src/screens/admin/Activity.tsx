import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { fetchAdminCropChecks } from '../../advice/adviceApi'
import { fetchFeedbackInbox, listAudit } from '../../admin/adminApi'
import { CropCheckCard } from '../../components/CropCheckCard'
import { useRemote } from '../../hooks/useRemote'
import { useT } from '../../i18n/context'

export function Activity() {
  const { t } = useT()
  const { state, reload } = useRemote(listAudit)
  const inbox = useRemote(fetchFeedbackInbox)
  const cropChecks = useRemote(fetchAdminCropChecks)

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
                        {[entry.targetId, entry.actorId].join(' · ')}
                        {entry.detail && (
                          <>
                            <br />
                            {entry.detail}
                          </>
                        )}
                      </span>
                      <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    </li>
                  ))}
                </ul>
              )
            }
          </RemoteView>
        </section>

        <section className="card">
          <h2 className="card-title">{t('activity.feedback')}</h2>
          <RemoteView state={inbox.state} onRetry={inbox.reload}>
            {(entries) =>
              entries.length === 0 ? (
                <p>{t('activity.feedbackEmpty')}</p>
              ) : (
                <ul className="plain-list">
                  {entries.map((entry) => (
                    <li key={entry.id} className="agent-line">
                      <span>{entry.message}</span>
                      <span className="farmer-meta">
                        {[entry.name, entry.role, entry.screen, entry.rating === null ? null : t('activity.rating', { n: entry.rating })].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </RemoteView>
        </section>

        <section className="card">
          <h2 className="card-title">{t('activity.cropChecks')}</h2>
          <RemoteView state={cropChecks.state} onRetry={cropChecks.reload}>
            {(checks) =>
              checks.length === 0 ? (
                <p>{t('activity.empty')}</p>
              ) : (
                <ul className="plain-list">
                  {checks.map((check) => (
                    <CropCheckCard key={check.id} check={check} canAnswer={false} />
                  ))}
                </ul>
              )
            }
          </RemoteView>
        </section>
      </main>
    </>
  )
}
