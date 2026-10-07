import { useState } from 'react'
import { loginStaff } from '../../auth/authApi'
import { useAuth } from '../../auth/context'
import { useSubmit } from '../../auth/useSubmit'
import { AuthLayout } from '../../components/AuthLayout'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import type { SignOutNotice } from '../../domain/auth'
import { useT } from '../../i18n/context'
import { RejectedError } from '../../lib/http'

interface StaffSignInProps {
  notice?: SignOutNotice
  onBack: () => void
  onSignUp: () => void
}

export function StaffSignIn({ notice, onBack, onSignUp }: StaffSignInProps) {
  const { t } = useT()
  const { completeStaffSignIn, awaitApproval } = useAuth()
  const { busy, error, setError, run } = useSubmit()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  function signIn() {
    if (!identifier.trim() || !password) return setError(t('auth.error.required'))
    void run(async () => {
      try {
        await completeStaffSignIn(await loginStaff(identifier.trim(), password))
      } catch (failure) {
        if (failure instanceof RejectedError && failure.code === 'pending_approval') return awaitApproval(identifier.trim(), password)
        throw failure
      }
    })
  }

  return (
    <AuthLayout title={t('auth.staff.title')} onBack={onBack}>
      {notice && (
        <p className="note" role="alert">
          {t(`auth.notice.${notice}`)}
        </p>
      )}
      <section className="card form">
        <Field label={t('auth.staff.identifier')} htmlFor="s-id">
          <input
            id="s-id"
            className="input"
            type="text"
            autoCapitalize="characters"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </Field>
        <Field label={t('auth.staff.password')} htmlFor="s-pass">
          <input
            id="s-pass"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </section>

      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <Button variant="main" disabled={busy} onClick={signIn}>
        {t('auth.staff.signIn')}
      </Button>
      <p className="center">{t('auth.staff.noAccount')}</p>
      <Button onClick={onSignUp}>{t('auth.staff.signUp')}</Button>
    </AuthLayout>
  )
}
