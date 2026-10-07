import { useState } from 'react'
import { useAuth } from '../../auth/context'
import { useSubmit } from '../../auth/useSubmit'
import { AuthLayout } from '../../components/AuthLayout'
import { Button } from '../../components/Button'
import { useT } from '../../i18n/context'

export function WaitingForApproval() {
  const { t } = useT()
  const { checkApproval, signOut } = useAuth()
  const { busy, error, run } = useSubmit()
  const [stillPending, setStillPending] = useState(false)

  function check() {
    setStillPending(false)
    void run(async () => setStillPending((await checkApproval()) === 'pending'))
  }

  return (
    <AuthLayout title={t('auth.waiting.title')}>
      <section className="card">
        <p>{t('auth.waiting.body')}</p>
      </section>
      {stillPending && <p className="note">{t('auth.waiting.stillPending')}</p>}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <Button variant="main" disabled={busy} onClick={check}>
        {t('auth.waiting.check')}
      </Button>
      <Button variant="text" onClick={() => void signOut()}>
        {t('auth.back')}
      </Button>
    </AuthLayout>
  )
}
