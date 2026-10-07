import { useState } from 'react'
import { signUpStaff, verifyStaffPhone } from '../../auth/authApi'
import { useSubmit } from '../../auth/useSubmit'
import { AuthLayout } from '../../components/AuthLayout'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { ASSOCIATIONS, OTP_LENGTH } from '../../domain/auth'
import { isValidPhone } from '../../domain/validation'
import { useT } from '../../i18n/context'

type Step = 'form' | 'verify' | 'done'

const MIN_PASSWORD_LENGTH = 8

export function StaffSignUp({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useT()
  const { busy, error, setError, run } = useSubmit()
  const [step, setStep] = useState<Step>('form')
  const [form, setForm] = useState({ name: '', phone: '', association: '', password: '' })
  const [code, setCode] = useState('')
  const [testCode, setTestCode] = useState<string | null>(null)

  const change = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }))

  function submit() {
    if (!form.name.trim() || !form.association || form.password.length < MIN_PASSWORD_LENGTH) return setError(t('auth.error.required'))
    if (!isValidPhone(form.phone)) return setError(t('reg.phoneInvalid'))
    void run(async () => {
      const created = await signUpStaff({ ...form, name: form.name.trim() })
      setTestCode(created.testCode ?? null)
      setStep('verify')
    })
  }

  function verify() {
    void run(async () => {
      await verifyStaffPhone(form.phone, code)
      setStep('done')
    })
  }

  if (step === 'done') {
    return (
      <AuthLayout title={t('auth.signup.doneTitle')}>
        <section className="card">
          <p>{t('auth.signup.doneBody')}</p>
        </section>
        <Button variant="main" onClick={onDone}>
          {t('auth.signup.toSignIn')}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={step === 'form' ? t('auth.signup.title') : t('auth.signup.verifyTitle')} onBack={onBack}>
      {step === 'form' ? (
        <section className="card form">
          <p className="hint">{t('auth.signup.agentOnly')}</p>
          <Field label={t('auth.signup.name')} htmlFor="u-name">
            <input id="u-name" className="input" type="text" autoComplete="name" value={form.name} onChange={(e) => change('name')(e.target.value)} />
          </Field>
          <Field label={t('auth.phone')} htmlFor="u-phone">
            <input id="u-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => change('phone')(e.target.value)} />
          </Field>
          <Field label={t('auth.signup.association')} htmlFor="u-assoc">
            <select id="u-assoc" className="input" value={form.association} onChange={(e) => change('association')(e.target.value)}>
              <option value="">{t('auth.signup.associationPlaceholder')}</option>
              {ASSOCIATIONS.map((association) => (
                <option key={association.id} value={association.id}>
                  {association.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('auth.signup.password')} htmlFor="u-pass">
            <input id="u-pass" className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => change('password')(e.target.value)} />
          </Field>
        </section>
      ) : (
        <section className="card form">
          <p>{t('auth.codeSent', { phone: form.phone })}</p>
          {testCode && <p className="test-note">{t('auth.testMode', { code: testCode })}</p>}
          <Field label={t('auth.code')} htmlFor="u-code">
            <input
              id="u-code"
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
      )}

      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {step === 'form' ? (
        <Button variant="main" disabled={busy} onClick={submit}>
          {t('auth.signup.submit')}
        </Button>
      ) : (
        <Button variant="main" disabled={busy || code.length !== OTP_LENGTH} onClick={verify}>
          {t('auth.continue')}
        </Button>
      )}
    </AuthLayout>
  )
}
