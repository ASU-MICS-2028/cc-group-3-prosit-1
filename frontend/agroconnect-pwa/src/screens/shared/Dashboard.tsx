import { CROP_BACKGROUND } from '../../components/cropColours'
import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import type { CropId } from '../../domain/farmer'
import { useT } from '../../i18n/context'

type Scope = 'association' | 'all'

const SAMPLE_BY_CROP: readonly { crop: CropId; count: number }[] = [
  { crop: 'maize', count: 210 },
  { crop: 'tomato', count: 148 },
  { crop: 'cassava', count: 96 },
  { crop: 'pepper', count: 61 },
]
const SAMPLE_TOTAL = { farmers: 412, agents: 18, today: 37 }

/** One screen for two audiences: a coordinator sees their association, an admin sees everything. */
export function Dashboard({ scope }: { scope: Scope }) {
  const { t } = useT()
  const max = Math.max(...SAMPLE_BY_CROP.map((row) => row.count))

  return (
    <>
      <ScreenHeader title={t('dashboard.title')} subtitle={scope === 'all' ? t('dashboard.scopeAll') : t('dashboard.scopeAssoc')} />
      <main className="screen-body">
        <SampleBadge />
        <div className="stat-grid">
          <section className="card stat">
            <p className="stat-number small">{SAMPLE_TOTAL.farmers}</p>
            <p className="stat-label">{t('dashboard.farmers')}</p>
          </section>
          <section className="card stat">
            <p className="stat-number small">{SAMPLE_TOTAL.today}</p>
            <p className="stat-label">{t('dashboard.today')}</p>
          </section>
        </div>
        <section className="card stat">
          <p className="stat-number small">{SAMPLE_TOTAL.agents}</p>
          <p className="stat-label">{t('dashboard.agents')}</p>
        </section>
        <section className="card">
          <h2 className="card-title">{t('dashboard.byCrop')}</h2>
          <ul className="bar-list">
            {SAMPLE_BY_CROP.map(({ crop, count }) => (
              <li key={crop} className="bar-row">
                <span className="bar-label">{t(`crop.${crop}`)}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(count / max) * 100}%`, background: CROP_BACKGROUND[crop] }} />
                </span>
                <span className="bar-count">{count}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="note">{t('dashboard.sampleNote')}</p>
      </main>
    </>
  )
}
