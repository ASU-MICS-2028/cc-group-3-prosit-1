import { Field } from '../../components/Field'
import { FARMER_LANGUAGES, GENDERS } from '../../domain/farmer'
import { useT } from '../../i18n/context'
import type { StepProps } from './stepProps'

export function Step1Who({ draft, update, errors }: StepProps) {
  const { t } = useT()
  return (
    <div className="card form">
      <Field label={t('reg.name')} required error={errors.name} htmlFor="f-name">
        <input
          id="f-name"
          className="input"
          type="text"
          autoComplete="off"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>

      <Field label={t('reg.phone')} required error={errors.phone} htmlFor="f-phone">
        <input
          id="f-phone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={draft.phone}
          onChange={(e) => update({ phone: e.target.value })}
        />
      </Field>

      <fieldset className="field">
        <legend className="label">{t('reg.language')}</legend>
        <div className="pill-row">
          {FARMER_LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className={draft.preferredLanguage === code ? 'pill is-selected' : 'pill'}
              aria-pressed={draft.preferredLanguage === code}
              onClick={() => update({ preferredLanguage: code })}
            >
              {t(`lang.${code}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="label">{t('reg.gender')}</legend>
        <div className="pill-row">
          {GENDERS.map((gender) => (
            <button
              key={gender}
              type="button"
              className={draft.gender === gender ? 'pill is-selected' : 'pill'}
              aria-pressed={draft.gender === gender}
              onClick={() => update({ gender: draft.gender === gender ? null : gender })}
            >
              {t(`gender.${gender}`)}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
