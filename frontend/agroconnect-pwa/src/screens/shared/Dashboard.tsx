import { fetchIncome, type Stats } from '../../admin/adminApi'
import { BarList, type BarRow } from '../../components/BarList'
import { Button } from '../../components/Button'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { ExportCsvButton } from '../../components/ExportCsvButton'
import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { formatCurrency } from '../../domain/country'
import { isCropId, isFarmerLanguage, isGender } from '../../domain/farmer'
import { useRemote } from '../../hooks/useRemote'
import { useStats } from '../../hooks/useStats'
import { useT } from '../../i18n/context'
import type { TranslationKey } from '../../i18n/translate'

/** Profile breakdowns for policy reporting (Prosit brief data requirements), shown once any answer exists. */
const PROFILE_CARDS: ['byNeed' | 'byPhoneType' | 'byMobileMoney' | 'byContactChannel' | 'byExtensionVisit', TranslationKey, string][] = [
  ['byNeed', 'profile.needs', 'profile.need'],
  ['byPhoneType', 'profile.phoneType', 'profile.phone'],
  ['byMobileMoney', 'profile.mobileMoney', 'profile.momo'],
  ['byContactChannel', 'profile.contactChannel', 'profile.channel'],
  ['byExtensionVisit', 'profile.extensionVisit', 'profile.visit'],
]

type Scope = 'association' | 'all'

const COMMUNITY_ROWS = 6
const DAY_ROWS = 7

const formatTime = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const formatDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })

function IncomeList() {
  const { t } = useT()
  const { state, reload } = useRemote(fetchIncome)
  return (
    <RemoteView state={state} onRetry={reload}>
      {(rows) =>
        rows.length === 0 ? (
          <p>{t('dashboard.incomeEmpty')}</p>
        ) : (
          <ul className="plain-list">
            {rows.map((row) => (
              <li key={`${row.farmerId}-${row.currency}`} className="list-item">
                <strong>{row.name}</strong>
                <span className="stat-number small">{formatCurrency(row.received, row.currency)}</span>
              </li>
            ))}
          </ul>
        )
      }
    </RemoteView>
  )
}

function StatsView({ stats, stale, onRetry }: { stats: Stats; stale: boolean; onRetry: () => void }) {
  const { t } = useT()

  const label = (kind: 'crop' | 'language' | 'gender' | 'plain', key: string): string => {
    if (kind === 'crop' && isCropId(key)) return t(`crop.${key}`)
    if (kind === 'language' && isFarmerLanguage(key)) return t(`lang.${key}`)
    if (kind === 'gender' && isGender(key)) return t(`gender.${key}`)
    return key === 'unknown' ? t('dashboard.unknown') : key
  }

  const rows = (list: Stats['byCrop'], kind: Parameters<typeof label>[0], colours?: boolean): BarRow[] =>
    list.map(({ key, count }) => ({
      key,
      count,
      label: label(kind, key),
      colour: colours && isCropId(key) ? CROP_BACKGROUND[key] : undefined,
    }))

  const syncByAgent = new Map(stats.sync.map((entry) => [entry.agentId, entry]))
  const empty = stats.totals.farmers === 0

  return (
    <>
      {stale ? (
        <>
          <p className="note" role="status">
            {t('dashboard.stale', { time: formatTime(stats.asOf) })}
          </p>
          <Button onClick={onRetry}>{t('common.retry')}</Button>
        </>
      ) : (
        <p className="progress-label">{t('dashboard.asOf', { time: formatTime(stats.asOf) })}</p>
      )}

      <div className="stat-grid">
        <section className="card stat">
          <p className="stat-number small">{stats.totals.farmers}</p>
          <p className="stat-label">{t('dashboard.farmers')}</p>
        </section>
        <section className="card stat">
          <p className="stat-number small">{stats.totals.farmersToday}</p>
          <p className="stat-label">{t('dashboard.today')}</p>
        </section>
      </div>
      <section className="card stat">
        <p className="stat-number small">{stats.totals.agentsActive}</p>
        <p className="stat-label">{t('dashboard.agents')}</p>
      </section>

      {!stale && <ExportCsvButton kind="farmers" />}

      {empty ? (
        <p className="note">{t('dashboard.noData')}</p>
      ) : (
        <>
          <section className="card">
            <h2 className="card-title">{t('dashboard.byDay')}</h2>
            <BarList rows={stats.byDay.slice(-DAY_ROWS).map(({ key, count }) => ({ key, count, label: formatDay(key) }))} />
          </section>
          <section className="card">
            <h2 className="card-title">{t('dashboard.byCrop')}</h2>
            <BarList rows={rows(stats.byCrop, 'crop', true)} />
          </section>
          <section className="card">
            <h2 className="card-title">{t('dashboard.byCommunity')}</h2>
            <BarList rows={rows(stats.byCommunity.slice(0, COMMUNITY_ROWS), 'plain')} />
          </section>
          <section className="card">
            <h2 className="card-title">{t('dashboard.byLanguage')}</h2>
            <BarList rows={rows(stats.byLanguage, 'language')} />
          </section>
          <section className="card">
            <h2 className="card-title">{t('dashboard.byGender')}</h2>
            <BarList rows={rows(stats.byGender, 'gender')} />
          </section>
          {PROFILE_CARDS.map(([field, title, prefix]) => {
            const list = stats[field]
            if (!list || list.every((row) => row.key === 'unknown')) return null
            return (
              <section key={field} className="card">
                <h2 className="card-title">{t(title)}</h2>
                <BarList rows={list.map(({ key, count }) => ({ key, count, label: key === 'unknown' ? t('dashboard.unknown') : t(`${prefix}.${key}` as TranslationKey) }))} />
              </section>
            )
          })}
        </>
      )}

      <section className="card">
        <h2 className="card-title">{t('dashboard.byAgent')}</h2>
        {stats.byAgent.length === 0 ? (
          <p>{t('dashboard.noAgents')}</p>
        ) : (
          <ul className="plain-list">
            {stats.byAgent.map((agent) => {
              const sync = syncByAgent.get(agent.agentId)
              return (
                <li key={agent.agentId} className="agent-line">
                  <span className="list-item">
                    <strong>{agent.name}</strong>
                    <span className="stat-number small">{agent.count}</span>
                  </span>
                  <span className="farmer-meta">
                    {sync
                      ? [
                          t('dashboard.pending', { n: sync.pending }),
                          sync.attention > 0 ? t('dashboard.attention', { n: sync.attention }) : null,
                          sync.lastSyncAt ? t('dashboard.lastSync', { time: formatTime(sync.lastSyncAt) }) : t('dashboard.neverSynced'),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : t('dashboard.neverSynced')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">{t('dashboard.payments')}</h2>
        {stats.payments.length === 0 ? (
          <p>{t('dashboard.paymentsLater')}</p>
        ) : (
          <ul className="plain-list">
            {stats.payments.map((row) => (
              <li key={row.currency} className="agent-line">
                <strong>{row.currency}</strong>
                <span className="farmer-meta">
                  {t('dashboard.collected')} {formatCurrency(row.collected, row.currency)} · {t('dashboard.paidOut')} {formatCurrency(row.paidOut, row.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!stale && <ExportCsvButton kind="payments" variant="secondary" />}
      </section>

      {!stale && (
        <section className="card">
          <h2 className="card-title">{t('dashboard.income')}</h2>
          <IncomeList />
        </section>
      )}
    </>
  )
}

/** One screen for two audiences: a coordinator sees their association, an admin sees everything. */
export function Dashboard({ scope }: { scope: Scope }) {
  const { t } = useT()
  const { state, stale, reload } = useStats()

  return (
    <>
      <ScreenHeader title={t('dashboard.title')} subtitle={scope === 'all' ? t('dashboard.scopeAll') : t('dashboard.scopeAssoc')} />
      <main className="screen-body">
        <RemoteView state={state} onRetry={reload}>
          {(stats) => <StatsView stats={stats} stale={stale} onRetry={reload} />}
        </RemoteView>
      </main>
    </>
  )
}
