import { useState } from 'react'
import { changePassword } from '../../auth/authApi'
import { useAuth } from '../../auth/context'
import { useSubmit } from '../../auth/useSubmit'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useT } from '../../i18n/context'

/** Staff change their own password. Success keeps this device signed in with the freshly issued token. */
export function ChangePassword({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const { state, applyCredentialChange } = useAuth()
  const { busy, error, setError, run } = useSubmit()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  function save() {
    if (!('session' in state)) return
    const token = state.session.token
    if (next.length < 8) return setError(t('auth.changePassword.tooShort'))
    void run(async () => {
      const result = await changePassword(token, current, next)
      await applyCredentialChange(result.token)
      onBack()
    })
  }

  return (
    <>
      <ScreenHeader title={t('auth.changePassword.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <Field label={t('auth.changePassword.current')} htmlFor="pw-current">
            <input id="pw-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label={t('auth.changePassword.next')} htmlFor="pw-next">
            <input id="pw-next" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        </section>
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        <Button variant="main" disabled={busy} onClick={save}>
          {t('auth.changePassword.save')}
        </Button>
      </main>
    </>
  )
}
