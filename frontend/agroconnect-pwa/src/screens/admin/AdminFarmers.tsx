import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { listAdminFarmers } from '../../admin/adminApi'
import { useRemote } from '../../hooks/useRemote'
import { useT } from '../../i18n/context'

export function AdminFarmers() {
  const { t } = useT()
  const { state, reload } = useRemote(listAdminFarmers)

  return (
    <>
      <ScreenHeader title={t('adminFarmers.title')} subtitle={state.status === 'ready' ? t('adminFarmers.count', { n: state.data.total }) : undefined} />
      <main className="screen-body">
        <RemoteView state={state} onRetry={reload}>
          {({ items }) =>
            items.length === 0 ? (
              <p className="note">{t('adminFarmers.empty')}</p>
            ) : (
              <ul className="plain-list">
                {items.map((farmer) => (
                  <li key={farmer.id} className="card agent-card">
                    <span className="farmer-name">{farmer.name}</span>
                    <span className="farmer-meta">{[farmer.community, farmer.region].filter(Boolean).join(', ') || farmer.phone}</span>
                    {farmer.registeredByName && <span className="farmer-meta">{t('adminFarmers.by', { agent: farmer.registeredByName })}</span>}
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </main>
    </>
  )
}
