import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { PaymentList } from '../../components/PaymentList'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useCachedRemote } from '../../hooks/useCachedRemote'
import { listOutbox } from '../../db/outbox'
import { COUNTRY_INFO, formatMoney } from '../../domain/country'
import { isWallet } from '../../domain/payments'
import { useT } from '../../i18n/context'
import { buildHistory } from '../../payments/history'
import { fetchWallet } from '../../payments/paymentsApi'
import { usePaymentPolling } from '../../payments/usePaymentPolling'
import { useSettings } from '../../settings/context'
import { LoanForm } from './LoanForm'
import { PaymentForm } from './PaymentForm'

type View = 'main' | 'pay' | 'receive' | 'loan'

function WalletMain({ onOpen }: { onOpen: (view: Exclude<View, 'main'>) => void }) {
  const { t } = useT()
  const { country } = useSettings()
  const { state, reload, stale } = useCachedRemote('wallet', fetchWallet, isWallet)
  const onPhone = useLiveQuery(() => listOutbox('payment'), [])
  usePaymentPolling(reload)

  const wallet = state.status === 'ready' ? state.data : null
  const balance = wallet?.balance.find((row) => row.currency === COUNTRY_INFO[country].currency)
  const history = buildHistory(onPhone ?? [], wallet?.items ?? [])

  return (
    <>
      <ScreenHeader title={t('wallet.title')} subtitle={t('wallet.testMode')} />
      <main className="screen-body">
        <section className="card stat">
          <p className="stat-label">{t('wallet.balance')}</p>
          <p className="stat-number">{wallet ? formatMoney(balance?.amount ?? 0, country) : '—'}</p>
          {balance && (
            <p className="farmer-meta">
              {t('wallet.received')} {formatMoney(balance.received, country)} · {t('wallet.paid')} {formatMoney(balance.paid, country)}
            </p>
          )}
          {!wallet && state.status === 'error' && <p className="farmer-meta">{t('wallet.balanceUnavailable')}</p>}
        </section>
        {stale && (
          <p className="note" role="status">
            {t('wallet.stale')}
          </p>
        )}

        <Button variant="main" onClick={() => onOpen('receive')}>
          {t('wallet.receive')}
        </Button>
        <Button onClick={() => onOpen('pay')}>{t('wallet.pay')}</Button>
        <Button onClick={() => onOpen('loan')}>{t('wallet.loan')}</Button>

        <section className="card">
          <h2 className="card-title">{t('wallet.history')}</h2>
          {history.length === 0 ? <p>{t('wallet.historyEmpty')}</p> : <PaymentList rows={history} />}
        </section>
      </main>
    </>
  )
}

export function Wallet() {
  const [view, setView] = useState<View>('main')
  const back = () => setView('main')

  if (view === 'pay') return <PaymentForm direction="collect" onBack={back} />
  if (view === 'receive') return <PaymentForm direction="payout" onBack={back} />
  if (view === 'loan') return <LoanForm onBack={back} />
  return <WalletMain onOpen={setView} />
}
