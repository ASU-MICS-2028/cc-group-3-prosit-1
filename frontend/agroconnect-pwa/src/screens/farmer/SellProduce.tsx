import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { CropPicker } from '../../components/CropPicker'
import { Field } from '../../components/Field'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SyncBadge } from '../../components/SyncBadge'
import { addToOutbox, listOutbox } from '../../db/outbox'
import { COUNTRY_INFO } from '../../domain/country'
import type { CropId } from '../../domain/farmer'
import { parsePositiveNumber } from '../../domain/validation'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'

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
          {mine && mine.length > 0 ? (
            <ul className="plain-list">
              {mine.map((item) => (
                <li key={item.clientId} className="list-item">
                  <span>
                    <strong>{t(`crop.${item.payload.crop}`)}</strong>
                    <br />
                    {t('sell.line', { kg: item.payload.quantityKg, price: `${item.payload.pricePerKg} ${item.payload.currency}` })}
                  </span>
                  <SyncBadge status="saved" />
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('sell.none')}</p>
          )}
        </section>
      </main>
    </>
  )
}
