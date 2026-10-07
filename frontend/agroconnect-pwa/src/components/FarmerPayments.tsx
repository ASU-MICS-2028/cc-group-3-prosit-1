import { useCallback } from 'react'
import { fetchFarmerPayments } from '../payments/paymentsApi'
import { buildHistory } from '../payments/history'
import { useRemote } from '../hooks/useRemote'
import { useT } from '../i18n/context'
import { PaymentList } from './PaymentList'
import { RemoteView } from './RemoteView'

/** The payments of one farmer, for the agent, coordinator or admin looking at their record. */
export function FarmerPayments({ recordId }: { recordId: string }) {
  const { t } = useT()
  const load = useCallback(() => fetchFarmerPayments(recordId), [recordId])
  const { state, reload } = useRemote(load)

  return (
    <RemoteView state={state} onRetry={reload}>
      {({ items }) => (items.length === 0 ? <p>{t('detail.paymentsNone')}</p> : <PaymentList rows={buildHistory([], items)} />)}
    </RemoteView>
  )
}
