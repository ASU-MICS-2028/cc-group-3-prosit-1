import { useLiveQuery } from 'dexie-react-hooks'
import { FeedbackForm } from '../../components/FeedbackForm'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SyncBadge } from '../../components/SyncBadge'
import { listOutbox } from '../../db/outbox'
import { useT } from '../../i18n/context'

export function FeedbackScreen({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  const mine = useLiveQuery(() => listOutbox('feedback'), [])

  return (
    <>
      <ScreenHeader title={t('feedback.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card">
          <FeedbackForm screen="more" />
        </section>
        {mine && mine.length > 0 && (
          <section className="card">
            <h2 className="card-title">{t('feedback.mine')}</h2>
            <ul className="plain-list">
              {mine.map((item) => (
                <li key={item.clientId} className="list-item">
                  <span>{item.payload.message}</span>
                  <SyncBadge status={item.status === 'sent' ? 'sent' : item.status === 'attention' ? 'attention' : 'saved'} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}
