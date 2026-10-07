import { CURRENCY_SYMBOL, formatCurrency } from '../domain/country'
import { useT } from '../i18n/context'
import type { HistoryRow, HistoryState } from '../payments/history'
import { SyncBadge } from './SyncBadge'
import type { SyncStatus } from '../domain/farmer'

const BADGE_FOR: Record<HistoryState, SyncStatus> = {
  queued: 'saved',
  pending: 'sending',
  successful: 'sent',
  failed: 'attention',
  attention: 'attention',
}

export function PaymentList({ rows }: { rows: readonly HistoryRow[] }) {
  const { t } = useT()
  return (
    <ul className="plain-list">
      {rows.map((row) => (
        <li key={row.clientId} className="payment-row">
          <span className="list-item">
            <strong>{t(`wallet.direction.${row.direction}`)}</strong>
            <span className="stat-number small" aria-label={`${CURRENCY_SYMBOL[row.currency]}`}>
              {formatCurrency(row.amount, row.currency)}
            </span>
          </span>
          <span className="farmer-meta">
            {t(`network.${row.network}`)} · {new Date(row.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <SyncBadge status={BADGE_FOR[row.state]} label={t(`wallet.state.${row.state}`)} />
          {row.message && <span className="error">{row.message}</span>}
        </li>
      ))}
    </ul>
  )
}
