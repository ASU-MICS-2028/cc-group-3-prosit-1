import { useState } from 'react'
import { useAuth } from '../../auth/context'
import { useSubmit } from '../../auth/useSubmit'
import { AuthLayout } from '../../components/AuthLayout'
import { Button } from '../../components/Button'
import { PinPad } from '../../components/PinPad'
import { PIN_LENGTH, type UserInfo } from '../../domain/auth'
import { useT } from '../../i18n/context'

export function PinUnlock({ user }: { user: UserInfo }) {
  const { t } = useT()
  const { unlock, signOut } = useAuth()
  const { busy, error, run } = useSubmit()
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)

  function onComplete(pin: string) {
    void run(async () => {
      const result = await unlock(pin)
      if (!result.ok) setAttemptsLeft(result.attemptsLeft)
    })
  }

  return (
    <AuthLayout title={t('auth.pin.unlockTitle')}>
      <section className="card">
        {user.name && <p className="card-title">{user.name}</p>}
        <p>{t('auth.pin.enter')}</p>
        <PinPad length={PIN_LENGTH[user.role]} disabled={busy} onComplete={onComplete} />
      </section>
      {attemptsLeft !== null && (
        <p className="note" role="alert">
          {t('auth.error.wrong_pin')} {t('auth.pin.attemptsLeft', { n: attemptsLeft })}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <Button variant="text" onClick={() => void signOut()}>
        {t('auth.signOut')}
      </Button>
    </AuthLayout>
  )
}
