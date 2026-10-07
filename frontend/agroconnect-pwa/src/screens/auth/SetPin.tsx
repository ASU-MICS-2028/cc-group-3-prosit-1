import { useState } from 'react'
import { useAuth } from '../../auth/context'
import { useSubmit } from '../../auth/useSubmit'
import { AuthLayout } from '../../components/AuthLayout'
import { PinPad } from '../../components/PinPad'
import { PIN_LENGTH, type Role } from '../../domain/auth'
import { useT } from '../../i18n/context'

export function SetPin({ role }: { role: Role }) {
  const { t } = useT()
  const { setStaffPin } = useAuth()
  const { busy, error, setError, run } = useSubmit()
  const [firstPin, setFirstPin] = useState<string | null>(null)
  const length = PIN_LENGTH[role]

  function onComplete(pin: string) {
    if (firstPin === null) {
      setFirstPin(pin)
      return setError(null)
    }
    if (pin !== firstPin) {
      setFirstPin(null)
      return setError(t('auth.pin.mismatch'))
    }
    void run(() => setStaffPin(pin))
  }

  return (
    <AuthLayout title={t('auth.pin.setTitle')}>
      <section className="card">
        <p>{t('auth.pin.setHint')}</p>
        <p className="card-title">{firstPin === null ? t('auth.pin.choose', { n: length }) : t('auth.pin.confirm')}</p>
        <PinPad key={firstPin === null ? 'choose' : 'confirm'} length={length} disabled={busy} onComplete={onComplete} />
      </section>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
    </AuthLayout>
  )
}
