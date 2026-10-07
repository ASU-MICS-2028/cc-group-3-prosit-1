import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { CropPicker } from '../../components/CropPicker'
import { Field } from '../../components/Field'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SyncBadge } from '../../components/SyncBadge'
import { addToOutbox, listOutbox, updateRemoteStatus } from '../../db/outbox'
import { COUNTRY_INFO, formatCurrency } from '../../domain/country'
import type { CropId, SyncStatus } from '../../domain/farmer'
import type { ListingState } from '../../domain/listings'
import type { OutboxItem } from '../../domain/outbox'
import { parsePositiveNumber } from '../../domain/validation'
import { useT } from '../../i18n/context'
import { closeListing } from '../../listings/listingsApi'
import { RejectedError } from '../../lib/http'
import { useSettings } from '../../settings/context'
import { requestSync } from '../../sync/syncQueue'

const BADGE_FOR: Record<ListingState, SyncStatus> = { queued: 'saved', attention: 'attention', open: 'sent', closed: 'sent' }

function stateOf(item: OutboxItem<'listing'>): ListingState {
  if (item.status === 'attention') return 'attention'
  if (item.status === 'saved') return 'queued'
  return item.remote?.status === 'closed' ? 'closed' : 'open'
}

export function SellProduce({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const { country } = useSettings()
  const { currency } = COUNTRY_INFO[country]
  const mine = useLiveQuery(() => listOutbox('listing'), [])

  const [crop, setCrop] = useState<CropId | null>(null)
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [community, setCommunity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  async function submit() {
    const quantityKg = parsePositiveNumber(quantity)
    const pricePerKg = parsePositiveNumber(price)
    if (!crop || quantityKg === null || pricePerKg === null) return setError(t('sell.invalid'))

    await addToOutbox('listing', { crop, quantityKg, pricePerKg, currency, community: community.trim() })
    setCrop(null)
    setQuantity('')
    setPrice('')
    setError(null)
    setSaved(true)
    void requestSync()
  }

  async function markSold(item: OutboxItem<'listing'>) {
    if (!item.remote) return
    setCloseError(null)
    try {
      await closeListing(item.remote.id)
      await updateRemoteStatus(item.clientId, 'closed')
    } catch (failure) {
      setCloseError(failure instanceof RejectedError ? failure.message : t('common.needsSignal'))
    }
  }

  return (
    <>
      <ScreenHeader title={t('sell.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <fieldset className="field">
            <legend className="label">{t('sell.crop')}</legend>
            <CropPicker value={crop} onChange={setCrop} />
          </fieldset>
          <Field label={t('sell.quantity')} htmlFor="sell-qty">
            <input id="sell-qty" className="input" type="text" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label={t('sell.price', { currency })} htmlFor="sell-price">
            <input id="sell-price" className="input" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label={t('sell.community')} htmlFor="sell-community">
            <input id="sell-community" className="input" type="text" value={community} onChange={(e) => setCommunity(e.target.value)} />
          </Field>
          <p className="hint">{t('sell.contactNote')}</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>

        {saved && (
          <p className="note" role="status">
            {t('sell.saved')}
          </p>
        )}
        <Button variant="main" onClick={() => void submit()}>
          {t('sell.submit')}
        </Button>

        <section className="card">
          <h2 className="card-title">{t('sell.mine')}</h2>
          {closeError && (
            <p className="error" role="alert">
              {closeError}
            </p>
          )}
          {mine && mine.length > 0 ? (
            <ul className="plain-list">
              {mine.map((item) => {
                const state = stateOf(item)
                return (
                  <li key={item.clientId} className="agent-line">
                    <span>
                      <strong>{t(`crop.${item.payload.crop}`)}</strong>
                      <br />
                      {t('sell.line', { kg: item.payload.quantityKg, price: formatCurrency(item.payload.pricePerKg, item.payload.currency) })}
                    </span>
                    <SyncBadge status={BADGE_FOR[state]} label={t(`sell.state.${state}`)} />
                    {item.errorMessage && <span className="error">{item.errorMessage}</span>}
                    {state === 'open' && <Button onClick={() => void markSold(item)}>{t('sell.markSold')}</Button>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p>{t('sell.none')}</p>
          )}
        </section>
      </main>
    </>
  )
}
