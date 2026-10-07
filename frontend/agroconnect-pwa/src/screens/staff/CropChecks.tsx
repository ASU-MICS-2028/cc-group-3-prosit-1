import { useCallback, useState } from 'react'
import { fetchCropChecks } from '../../advice/adviceApi'
import { CropCheckCard } from '../../components/CropCheckCard'
import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { isCropCheckList, type CropCheckStatus } from '../../domain/advice'
import { useCachedRemote } from '../../hooks/useCachedRemote'
import { useT } from '../../i18n/context'

const TABS: readonly CropCheckStatus[] = ['open', 'answered']

export function CropChecks({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  const [status, setStatus] = useState<CropCheckStatus>('open')
  const load = useCallback(() => fetchCropChecks(status), [status])
  const { state, reload, stale } = useCachedRemote(`cropChecks:${status}`, load, isCropCheckList)

  return (
    <>
      <ScreenHeader title={t('checks.title')} onBack={onBack} />
      <main className="screen-body">
        <div className="pill-row">
          {TABS.map((tab) => (
            <button key={tab} type="button" className={tab === status ? 'pill pill-on-green is-selected' : 'pill pill-on-green'} aria-pressed={tab === status} onClick={() => setStatus(tab)}>
              {t(`checks.tab.${tab}`)}
            </button>
          ))}
        </div>

        {stale && (
          <p className="note" role="status">
            {t('checks.stale')}
          </p>
        )}
        <RemoteView state={state} onRetry={reload}>
          {(checks) =>
            checks.length === 0 ? (
              <p className="note">{status === 'open' ? t('checks.emptyOpen') : t('checks.emptyAnswered')}</p>
            ) : (
              <ul className="plain-list">
                {checks.map((check) => (
                  <CropCheckCard key={check.id} check={check} canAnswer onAnswered={reload} />
                ))}
              </ul>
            )
          }
        </RemoteView>
      </main>
    </>
  )
}
