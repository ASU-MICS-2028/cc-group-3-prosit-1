import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SyncBadge } from '../../components/SyncBadge'
import { addToOutbox, listOutbox } from '../../db/outbox'
import { COUNTRY_INFO, formatCurrency } from '../../domain/country'
import { MAX_LOAN_AMOUNT, MAX_PURPOSE_LENGTH } from '../../domain/payments'
import { parsePositiveNumber } from '../../domain/validation'
import { useT } from '../../i18n/context'
import { useSettings } from '../../settings/context'
import { requestSync } from '../../sync/syncQueue'

export function LoanForm({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const { country } = useSettings()
  const { currency } = COUNTRY_INFO[country]
  const requests = useLiveQuery(() => listOutbox('loanRequest'), [])

  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit() {
    const value = parsePositiveNumber(amount)
    const reason = purpose.trim()
    if (value === null || value > MAX_LOAN_AMOUNT || !reason) return setError(t('loan.invalid'))

    await addToOutbox('loanRequest', { amount: value, currency, purpose: reason })
    setAmount('')
    setPurpose('')
    setError(null)
    setSaved(true)
    void requestSync()
  }

  return (
    <>
      <ScreenHeader title={t('loan.title')} subtitle={t('loan.hint')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <Field label={t('loan.amount', { currency })} htmlFor="loan-amount">
            <input id="loan-amount" className="input" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t('loan.purpose')} htmlFor="loan-purpose" error={error ?? undefined}>
            <textarea id="loan-purpose" className="input textarea" rows={3} maxLength={MAX_PURPOSE_LENGTH} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
        </section>

        {saved && (
          <p className="note" role="status">
            {t('loan.saved')}
          </p>
        )}
        <Button variant="main" onClick={() => void submit()}>
          {t('loan.submit')}
        </Button>

        <section className="card">
          <h2 className="card-title">{t('wallet.loans')}</h2>
          {requests && requests.length > 0 ? (
            <ul className="plain-list">
              {requests.map((request) => (
                <li key={request.clientId} className="list-item">
                  <span>
                    <strong>{formatCurrency(request.payload.amount, request.payload.currency)}</strong>
                    <br />
                    {request.payload.purpose}
                  </span>
                  <SyncBadge status={request.status === 'sent' ? 'sent' : request.status === 'attention' ? 'attention' : 'saved'} />
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('wallet.loansEmpty')}</p>
          )}
        </section>
      </main>
    </>
  )
}
