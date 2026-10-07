import { useT } from '../i18n/context'
import { APP_LANGUAGES } from '../i18n/translate'

export function LanguagePicker() {
  const { t, language, setLanguage } = useT()
  return (
    <fieldset className="language-picker">
      <legend className="label">{t('auth.language')}</legend>
      <div className="pill-row">
        {APP_LANGUAGES.map((code) => (
          <button
            key={code}
            type="button"
            className={code === language ? 'pill is-selected' : 'pill'}
            aria-pressed={code === language}
            onClick={() => setLanguage(code)}
          >
            {t(`lang.${code}`)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
