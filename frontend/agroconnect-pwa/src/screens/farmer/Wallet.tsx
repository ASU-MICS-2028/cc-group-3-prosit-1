import { ScreenHeader } from '../../components/ScreenHeader'
import { formatMoney } from '../../domain/country'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'

export function Wallet() {
  const { t } = useT()
  const { country } = useSettings()

  return (
    <>
      <ScreenHeader title={t('wallet.title')} subtitle={t('wallet.testMode')} />
      <main className="screen-body">
        <section className="card stat">
          <p className="stat-label">{t('wallet.balance')}</p>
          <p className="stat-number">{formatMoney(0, country)}</p>
        </section>

        <section className="card">
          <h2 className="card-title">{t('wallet.history')}</h2>
          <p>{t('wallet.historyEmpty')}</p>
        </section>

        <section className="card">
          <ul className="plain-list">
            {(['wallet.receive', 'wallet.pay', 'wallet.loan'] as const).map((key) => (
              <li key={key} className="list-item">
                <span>{t(key)}</span>
                <span className="soon">{t('common.soon')}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
