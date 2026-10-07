import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import type { RegistrationStep } from '../../domain/farmer'
import {
  firstStepWithError,
  validateAll,
  validateStep,
  type FieldErrors,
} from '../../domain/validation'
import { useT } from '../../i18n/context'
import { requestSync } from '../../sync/syncQueue'
import { Step1Who } from './Step1Who'
import { Step2Farm } from './Step2Farm'
import { Step3Proof } from './Step3Proof'
import type { StepProps } from './stepProps'
import { useRegistrationDraft } from './useRegistrationDraft'

const STEPS = [1, 2, 3] as const
const STEP_TITLES = { 1: 'reg.step1', 2: 'reg.step2', 3: 'reg.step3' } as const
const TOAST_MS = 2500

interface RegisterProps {
  onSaved: () => void
}

export function Register({ onSaved }: RegisterProps) {
  const { t } = useT()
  const { draft, pending, update, resume, startNew, submit } = useRegistrationDraft()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveFailed, setSaveFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSavedToast, setShowSavedToast] = useState(false)

  useEffect(() => {
    if (!showSavedToast) return
    const timer = setTimeout(() => setShowSavedToast(false), TOAST_MS)
    return () => clearTimeout(timer)
  }, [showSavedToast])

  if (pending) {
    return (
      <>
        <header className="screen-header">
          <h1>{t('reg.title')}</h1>
        </header>
        <main className="screen-body">
          <section className="card">
            <p className="card-title">{t('reg.resume')}</p>
            <p>{pending.name || pending.phone}</p>
          </section>
          <Button variant="main" onClick={resume}>
            {t('reg.resumeYes')}
          </Button>
          <Button onClick={() => void startNew()}>{t('reg.resumeNo')}</Button>
        </main>
      </>
    )
  }

  if (!draft) return null

  const messages: StepProps['errors'] = Object.fromEntries(
    Object.entries(errors).map(([field, code]) => [field, t(`reg.${code}`)]),
  )

  function goToStep(step: RegistrationStep) {
    update({ step })
    setErrors({})
    window.scrollTo(0, 0)
  }

  function goNext() {
    if (!draft) return
    const found = validateStep(draft.step, draft)
    setErrors(found)
    if (Object.keys(found).length === 0 && draft.step < 3) goToStep((draft.step + 1) as RegistrationStep)
  }

  async function save(registerNext: boolean) {
    if (!draft) return
    const found = validateAll(draft)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      update({ step: firstStepWithError(found) })
      return
    }

    setSaving(true)
    setSaveFailed(false)
    try {
      await submit({ keepLocation: registerNext })
    } catch {
      setSaveFailed(true)
      return
    } finally {
      setSaving(false)
    }

    setErrors({})
    window.scrollTo(0, 0)
    void requestSync()
    if (registerNext) setShowSavedToast(true)
    else onSaved()
  }

  const { step } = draft
  const stepProps: StepProps = { draft, update, errors: messages }

  return (
    <>
      <header className="screen-header">
        <h1>{t('reg.title')}</h1>
        <div className="progress" aria-hidden="true">
          {STEPS.map((number) => (
            <span key={number} className={number <= step ? 'progress-bar is-done' : 'progress-bar'} />
          ))}
        </div>
        <p className="progress-label">
          {t('reg.stepOf', { step, total: STEPS.length })} · {t(STEP_TITLES[step])}
        </p>
      </header>

      <main className="screen-body">
        {step === 1 && <Step1Who {...stepProps} />}
        {step === 2 && <Step2Farm {...stepProps} />}
        {step === 3 && <Step3Proof {...stepProps} />}

        {saveFailed && (
          <p className="note" role="alert">
            {t('reg.saveFailed')}
          </p>
        )}

        {step < 3 ? (
          <Button variant="main" onClick={goNext}>
            {t('reg.next')}
          </Button>
        ) : (
          <>
            <Button variant="main" disabled={saving} onClick={() => void save(true)}>
              {t('reg.saveNext')}
            </Button>
            <Button disabled={saving} onClick={() => void save(false)}>
              {t('reg.save')}
            </Button>
          </>
        )}
        {step > 1 && (
          <Button variant="text" onClick={() => goToStep((step - 1) as RegistrationStep)}>
            {t('reg.back')}
          </Button>
        )}
      </main>

      {showSavedToast && (
        <div className="toast" role="status">
          {t('reg.saved')}
        </div>
      )}
    </>
  )
}
