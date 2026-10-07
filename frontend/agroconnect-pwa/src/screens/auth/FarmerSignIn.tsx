import { useState } from 'react'
import { loginFarmer, startFarmer, verifyFarmerOtp } from '../../auth/authApi'
import { useAuth } from '../../auth/context'
import { useSubmit } from '../../auth/useSubmit'
import { AuthLayout } from '../../components/AuthLayout'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { PinPad } from '../../components/PinPad'
import { OTP_LENGTH, PIN_LENGTH } from '../../domain/auth'
import { isValidPhone } from '../../domain/validation'
import { useT } from '../../i18n/context'

type Step = 'phone' | 'code' | 'newPin' | 'confirmPin' | 'pin'

const PIN = PIN_LENGTH.farmer

export function FarmerSignIn({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const { completeFarmerSignIn } = useAuth()
  const { busy, error, setError, run } = useSubmit()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [testCode, setTestCode] = useState<string | null>(null)
  const [firstPin, setFirstPin] = useState('')

  function goBack() {
    setError(null)
    if (step === 'phone') onBack()
    else setStep('phone')
  }

  function requestCode(forgotPin = false) {
    if (!isValidPhone(phone)) return setError(t('reg.phoneInvalid'))
    void run(async () => {
      const started = await startFarmer(phone, forgotPin)
      if (started.next === 'pin') return setStep('pin')
      setTestCode(started.testCode ?? null)
      setCode('')
      setStep('code')
    })
  }

  function confirmPin(pin: string) {
    if (pin !== firstPin) {
      setError(t('auth.pin.mismatch'))
      return setStep('newPin')
    }
    void run(async () => {
      try {
        await completeFarmerSignIn(await verifyFarmerOtp(phone, code, pin), pin)
      } catch (failure) {
        setStep('code')
        throw failure
      }
    })
  }

  function signInWithPin(pin: string) {
    void run(async () => completeFarmerSignIn(await loginFarmer(phone, pin), pin))
  }

  return (
    <AuthLayout title={t('auth.farmer.title')} onBack={goBack}>
      {step === 'phone' && (
        <>
          <section className="card form">
            <Field label={t('auth.phone')} htmlFor="a-phone">
              <input
                id="a-phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </section>
          <Button variant="main" disabled={busy} onClick={() => requestCode()}>
            {t('auth.sendCode')}
          </Button>
        </>
      )}

      {step === 'code' && (
        <>
          <section className="card form">
            <p>{t('auth.codeSent', { phone })}</p>
            {testCode && <p className="test-note">{t('auth.testMode', { code: testCode })}</p>}
            <Field label={t('auth.code')} htmlFor="a-code">
              <input
                id="a-code"
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </section>
          <Button variant="main" disabled={code.length !== OTP_LENGTH} onClick={() => setStep('newPin')}>
            {t('auth.continue')}
          </Button>
        </>
      )}

      {(step === 'newPin' || step === 'confirmPin' || step === 'pin') && (
        <section className="card">
          <p className="card-title">
            {step === 'newPin' && t('auth.pin.choose', { n: PIN })}
            {step === 'confirmPin' && t('auth.pin.confirm')}
            {step === 'pin' && t('auth.pin.enter')}
          </p>
          <PinPad
            key={step}
            length={PIN}
            disabled={busy}
            onComplete={(pin) => {
              if (step === 'newPin') {
                setFirstPin(pin)
                setError(null)
                setStep('confirmPin')
              } else if (step === 'confirmPin') confirmPin(pin)
              else signInWithPin(pin)
            }}
          />
          {step === 'pin' && (
            <Button variant="text" className="on-card" onClick={() => requestCode(true)}>
              {t('auth.pin.forgot')}
            </Button>
          )}
        </section>
      )}

      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
    </AuthLayout>
  )
}
