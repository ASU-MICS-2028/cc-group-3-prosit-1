import { useState } from 'react'
import { changePin } from '../../auth/authApi'
import { useAuth } from '../../auth/context'
import { useSubmit } from '../../auth/useSubmit'
import { PinPad } from '../../components/PinPad'
import { ScreenHeader } from '../../components/ScreenHeader'
import { PIN_LENGTH } from '../../domain/auth'
import { useT } from '../../i18n/context'

type Step = 'current' | 'new' | 'confirm'

/** A farmer changes their own PIN: the current one, then the new one twice. */
export function ChangePin({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const { state, applyCredentialChange } = useAuth()
  const { busy, error, setError, run } = useSubmit()
  const [step, setStep] = useState<Step>('current')
  const [current, setCurrent] = useState('')
  const [first, setFirst] = useState('')
  const length = PIN_LENGTH.farmer

  function onComplete(pin: string) {
    if (step === 'current') {
      setCurrent(pin)
      setError(null)
      return setStep('new')
    }
    if (step === 'new') {
      setFirst(pin)
      setError(null)
      return setStep('confirm')
    }
    if (pin !== first) {
      setFirst('')
      setStep('new')
      return setError(t('auth.pin.mismatch'))
    }
    if (!('session' in state)) return
    const token = state.session.token
    void run(async () => {
      const result = await changePin(token, current, pin)
      await applyCredentialChange(result.token, pin)
      onBack()
    })
  }

  return (
    <>
      <ScreenHeader title={t('auth.changePin.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card">
          <p className="card-title">{step === 'current' ? t('auth.changePin.current') : step === 'new' ? t('auth.pin.choose', { n: length }) : t('auth.pin.confirm')}</p>
          <PinPad key={step} length={length} disabled={busy} onComplete={onComplete} />
        </section>
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
      </main>
    </>
  )
}
