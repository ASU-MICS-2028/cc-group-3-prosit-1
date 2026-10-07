import { useState } from 'react'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { ScreenHeader } from '../../components/ScreenHeader'
import { addToOutbox } from '../../db/outbox'
import { COUNTRY_INFO } from '../../domain/country'
import { MAX_PAYMENT_AMOUNT, NETWORKS_BY_CURRENCY, type PaymentDirection, type PaymentNetwork } from '../../domain/payments'
import { toE164 } from '../../domain/phone'
import { parsePositiveNumber } from '../../domain/validation'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'
import { requestSync } from '../../sync/syncQueue'

interface PaymentFormProps {
  direction: PaymentDirection
  onBack: () => void
}

export function PaymentForm({ direction, onBack }: PaymentFormProps) {
  const { t } = useT()
  const { country } = useSettings()
  const { currency } = COUNTRY_INFO[country]
  const networks = NETWORKS_BY_CURRENCY[currency]
  const user = useCurrentUser()

  const [amount, setAmount] = useState('')
  const [network, setNetwork] = useState<PaymentNetwork>(networks[0] ?? 'mtn')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit() {
    const value = parsePositiveNumber(amount)
    if (value === null || value > MAX_PAYMENT_AMOUNT) return setError(t('payment.invalidAmount', { max: MAX_PAYMENT_AMOUNT }))
    const e164 = toE164(phone)
    if (!e164) return setError(t('payment.invalidPhone'))

    await addToOutbox('payment', { direction, amount: value, currency, network, phone: e164 })
    setError(null)
    setSaved(true)
    void requestSync()
  }

  const title = direction === 'collect' ? t('payment.titlePay') : t('payment.titleReceive')

  if (saved) {
    return (
      <>
        <ScreenHeader title={title} subtitle={t('wallet.testMode')} />
        <main className="screen-body">
          <p className="note" role="status">
            {t('payment.saved')}
          </p>
          <Button variant="main" onClick={onBack}>
            {t('payment.done')}
          </Button>
        </main>
      </>
    )
  }

  return (
    <>
      <ScreenHeader title={title} subtitle={t('wallet.testMode')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <Field label={t('payment.amount', { currency })} htmlFor="pay-amount" error={error ?? undefined}>
            <input id="pay-amount" className="input" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <fieldset className="field">
            <legend className="label">{t('payment.network')}</legend>
            <div className="pill-row">
              {networks.map((option) => (
                <button key={option} type="button" className={option === network ? 'pill is-selected' : 'pill'} aria-pressed={option === network} onClick={() => setNetwork(option)}>
                  {t(`network.${option}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={t('payment.phone')} htmlFor="pay-phone">
            <input id="pay-phone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </section>
        <Button variant="main" onClick={() => void submit()}>
          {t('payment.submit')}
        </Button>
      </main>
    </>
  )
}
