import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../components/Button'
// import { FontTest } from '../components/FontTest'
import { Gauge } from '../components/Gauge'
import { db } from '../db/db'
import { SYNC_STATUS } from '../domain/farmer'
import { useOnline } from '../hooks/useOnline'
import { useT } from '../i18n/context'

function startOfToday(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

export function Home({ onRegister }: { onRegister: () => void }) {
  const { t } = useT()
  const online = useOnline()

  const registeredToday = useLiveQuery(() => db.farmers.where('createdAt').aboveOrEqual(startOfToday()).count(), [], 0)
  const sentToday = useLiveQuery(
    () =>
      db.farmers
        .where('createdAt')
        .aboveOrEqual(startOfToday())
        .filter((farmer) => farmer.status === SYNC_STATUS.SENT)
        .count(),
    [],
    0,
  )
  const waiting = useLiveQuery(
    () => db.farmers.where('status').anyOf(SYNC_STATUS.SAVED, SYNC_STATUS.SENDING).count(),
    [],
    0,
  )

  return (
    <>
      <header className="screen-header">
        <span className={online ? 'net-pill is-online' : 'net-pill'}>
          <span className="net-dot" aria-hidden="true" />
          {online ? t('net.online') : t('net.offline')}
        </span>
        <h1>{t('home.title')}</h1>
      </header>

      <main className="screen-body">
        <section className="card gauge-card">
          <Gauge
            value={registeredToday ? sentToday / registeredToday : 0}
            label={t('home.gaugeLabel', { sent: sentToday, total: registeredToday })}
          />
          <p className="stat-number gauge-number">{registeredToday}</p>
          <p className="stat-label">{t('home.registeredToday')}</p>
        </section>

        <div className="stat-grid">
          <section className="card stat">
            <p className="stat-number small">{sentToday}</p>
            <p className="stat-label">{t('home.sentToday')}</p>
          </section>
          <section className="card stat">
            <p className="stat-number small">{waiting}</p>
            <p className="stat-label">{t('home.waiting')}</p>
          </section>
        </div>

        {!online && <p className="note">{t('home.offlineNote')}</p>}

        <Button variant="main" onClick={onRegister}>
          {t('home.registerFarmer')}
        </Button>

        {/* <FontTest /> */}
      </main>
    </>
  )
}
