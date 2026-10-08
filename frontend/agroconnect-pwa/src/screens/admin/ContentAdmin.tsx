import { useState } from 'react'
import { Button } from '../../components/Button'
import { CropPicker } from '../../components/CropPicker'
import { Field } from '../../components/Field'
import { ScreenHeader } from '../../components/ScreenHeader'
import { archiveAdvice, publishAdvice, recordMarketPrice } from '../../content/contentApi'
import { useAdvice } from '../../content/useContent'
import { COUNTRIES, type CountryCode } from '../../domain/country'
import type { CropId } from '../../domain/farmer'
import { parsePositiveNumber } from '../../domain/validation'
import { useT } from '../../i18n/context'
import { RejectedError } from '../../lib/http'
import { useSettings } from '../../settings/context'

/** Admins and coordinators enter today's market prices and publish advice cards (CONTENT-CONTRACT.md). Needs signal. */
export function ContentAdmin({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const settings = useSettings()
  const { view: advice, reload } = useAdvice()

  const [country, setCountry] = useState<CountryCode>(settings.country)
  const [priceCrop, setPriceCrop] = useState<CropId | null>(null)
  const [price, setPrice] = useState('')
  const [priceNote, setPriceNote] = useState<{ ok: boolean; text: string } | null>(null)

  const [adviceCrop, setAdviceCrop] = useState<CropId | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [adviceNote, setAdviceNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const failure = (error: unknown) => (error instanceof RejectedError ? error.message : t('common.needsSignal'))

  async function savePrice() {
    const value = parsePositiveNumber(price)
    if (!priceCrop || value === null) return setPriceNote({ ok: false, text: t('content.priceInvalid') })
    setBusy(true)
    try {
      await recordMarketPrice({ country, crop: priceCrop, pricePerKg: value })
      setPriceNote({ ok: true, text: t('content.priceSaved', { crop: t(`crop.${priceCrop}`) }) })
      setPrice('')
      setPriceCrop(null)
    } catch (error) {
      setPriceNote({ ok: false, text: failure(error) })
    } finally {
      setBusy(false)
    }
  }

  async function saveAdvice() {
    if (!adviceCrop || !title.trim() || !body.trim()) return setAdviceNote({ ok: false, text: t('content.adviceInvalid') })
    setBusy(true)
    try {
      await publishAdvice({ crop: adviceCrop, title: title.trim(), body: body.trim() })
      setAdviceNote({ ok: true, text: t('content.adviceSaved') })
      setTitle('')
      setBody('')
      setAdviceCrop(null)
      reload()
    } catch (error) {
      setAdviceNote({ ok: false, text: failure(error) })
    } finally {
      setBusy(false)
    }
  }

  async function archive(id: string) {
    setBusy(true)
    try {
      await archiveAdvice(id)
      reload()
    } catch (error) {
      setAdviceNote({ ok: false, text: failure(error) })
    } finally {
      setBusy(false)
    }
  }

  const note = (value: { ok: boolean; text: string } | null) =>
    value && (
      <p className={value.ok ? 'note' : 'error'} role="status">
        {value.text}
      </p>
    )

  return (
    <>
      <ScreenHeader title={t('content.title')} subtitle={t('content.hint')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <h2 className="card-title">{t('content.priceTitle')}</h2>
          <Field label={t('market.country')} htmlFor="price-country">
            <select id="price-country" className="input" value={country} onChange={(e) => setCountry(e.target.value as CountryCode)}>
              {COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {t(`country.${code}`)}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="field">
            <legend className="label">{t('sell.crop')}</legend>
            <CropPicker value={priceCrop} onChange={setPriceCrop} />
          </fieldset>
          <Field label={t('content.pricePerKg')} htmlFor="price-value">
            <input id="price-value" className="input" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          {note(priceNote)}
          <Button variant="main" disabled={busy} onClick={() => void savePrice()}>
            {t('content.priceSave')}
          </Button>
        </section>

        <section className="card form">
          <h2 className="card-title">{t('content.adviceTitle')}</h2>
          <fieldset className="field">
            <legend className="label">{t('sell.crop')}</legend>
            <CropPicker value={adviceCrop} onChange={setAdviceCrop} />
          </fieldset>
          <Field label={t('content.adviceHeading')} htmlFor="advice-title">
            <input id="advice-title" className="input" type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('content.adviceBody')} htmlFor="advice-body">
            <textarea id="advice-body" className="input" rows={4} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          {note(adviceNote)}
          <Button disabled={busy} onClick={() => void saveAdvice()}>
            {t('content.advicePublish')}
          </Button>
        </section>

        <section className="card">
          <h2 className="card-title">{t('content.published')}</h2>
          {advice && !advice.sample ? (
            <ul className="plain-list">
              {advice.cards.map((card) => (
                <li key={'id' in card ? String(card.id) : card.title} className="list-item">
                  <span>
                    <strong>{card.title}</strong> · {t(`crop.${card.crop}`)}
                  </span>
                  {'id' in card && (
                    <Button variant="text" disabled={busy} onClick={() => void archive(String(card.id))}>
                      {t('content.archive')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('content.none')}</p>
          )}
        </section>
      </main>
    </>
  )
}
