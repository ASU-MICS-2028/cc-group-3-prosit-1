import { useT } from '../i18n/context'

/** An arrow and a number, so the direction reads even without colour. */
export function PriceChange({ change }: { change: number }) {
  const { t } = useT()
  const rounded = Math.round(Math.abs(change))
  if (rounded === 0) return <span className="price-change is-flat" aria-label={t('market.flat')}>–</span>

  const up = change > 0
  return (
    <span className={up ? 'price-change is-up' : 'price-change is-down'} aria-label={t(up ? 'market.up' : 'market.down', { n: rounded })}>
      {up ? '▲' : '▼'} {rounded}%
    </span>
  )
}
