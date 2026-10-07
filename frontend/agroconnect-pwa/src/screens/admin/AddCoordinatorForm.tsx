import { useState } from 'react'
import { createCoordinator } from '../../admin/adminApi'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { ASSOCIATIONS } from '../../domain/auth'
import { useT } from '../../i18n/context'
import { RejectedError } from '../../lib/http'

interface AddCoordinatorFormProps {
  onCreated: () => void
  onCancel: () => void
}

const EMPTY = { name: '', phone: '', association: '', password: '' }

export function AddCoordinatorForm({ onCreated, onCancel }: AddCoordinatorFormProps) {
  const { t } = useT()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const change = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }))

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const created = await createCoordinator({ ...form, name: form.name.trim() })
      setCreatedId(created.loginId ?? '')
      setForm(EMPTY)
      onCreated()
    } catch (failure) {
      setError(failure instanceof RejectedError ? failure.message : t('common.needsSignal'))
    } finally {
      setBusy(false)
    }
  }

  if (createdId !== null) {
    return (
      <section className="card form">
        <p className="note" role="status">
          {t('coordinators.created', { id: createdId })}
        </p>
        <Button variant="main" onClick={onCancel}>
          {t('common.close')}
        </Button>
      </section>
    )
  }

  return (
    <section className="card form">
      <h2 className="card-title">{t('coordinators.add')}</h2>
      <Field label={t('auth.signup.name')} htmlFor="c-name">
        <input id="c-name" className="input" type="text" autoComplete="off" value={form.name} onChange={(e) => change('name')(e.target.value)} />
      </Field>
      <Field label={t('auth.phone')} htmlFor="c-phone">
        <input id="c-phone" className="input" type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => change('phone')(e.target.value)} />
      </Field>
      <Field label={t('auth.signup.association')} htmlFor="c-assoc">
        <select id="c-assoc" className="input" value={form.association} onChange={(e) => change('association')(e.target.value)}>
          <option value="">{t('auth.signup.associationPlaceholder')}</option>
          {ASSOCIATIONS.map((association) => (
            <option key={association.id} value={association.id}>
              {association.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('coordinators.password')} htmlFor="c-pass" error={error ?? undefined}>
        <input id="c-pass" className="input" type="text" autoComplete="off" value={form.password} onChange={(e) => change('password')(e.target.value)} />
      </Field>
      <Button variant="main" disabled={busy} onClick={() => void submit()}>
        {t('coordinators.create')}
      </Button>
      <Button variant="text" className="on-card" onClick={onCancel}>
        {t('coordinators.cancel')}
      </Button>
    </section>
  )
}
