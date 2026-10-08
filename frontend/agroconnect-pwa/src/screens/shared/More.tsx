import { useState } from 'react'
import { Button } from '../../components/Button'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SignOutButton } from '../../components/SignOutButton'
import { useT } from '../../i18n/context'
import type { TranslationKey } from '../../i18n/translate'
import { ContentAdmin } from '../admin/ContentAdmin'
import { Requests } from '../admin/Requests'
import { CropChecks } from '../staff/CropChecks'
import { FeedbackScreen } from './FeedbackScreen'
import { MarketPrices } from './MarketPrices'
import { Settings } from './Settings'
import { Weather } from './Weather'

export type MoreEntry = 'weather' | 'market' | 'checks' | 'content' | 'requests' | 'feedback' | 'settings'

const LABELS: Record<MoreEntry, TranslationKey> = {
  weather: 'more.weather',
  market: 'more.market',
  checks: 'more.checks',
  content: 'more.content',
  requests: 'more.requests',
  feedback: 'more.feedback',
  settings: 'more.settings',
}

export function More({ entries }: { entries: readonly MoreEntry[] }) {
  const { t } = useT()
  const [view, setView] = useState<MoreEntry | null>(null)
  const back = () => setView(null)

  switch (view) {
    case 'weather':
      return <Weather onBack={back} />
    case 'market':
      return (
        <>
          <MarketPrices />
          <div className="screen-body">
            <Button variant="text" onClick={back}>
              ← {t('common.back')}
            </Button>
          </div>
        </>
      )
    case 'checks':
      return <CropChecks onBack={back} />
    case 'content':
      return <ContentAdmin onBack={back} />
    case 'requests':
      return <Requests onBack={back} />
    case 'feedback':
      return <FeedbackScreen onBack={back} />
    case 'settings':
      return <Settings onBack={back} />
    case null:
      return (
        <>
          <ScreenHeader title={t('more.title')} />
          <main className="screen-body">
            <ul className="plain-list menu">
              {entries.map((entry) => (
                <li key={entry}>
                  <button type="button" className="card menu-row" onClick={() => setView(entry)}>
                    {t(LABELS[entry])}
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
            <SignOutButton />
          </main>
        </>
      )
  }
}
