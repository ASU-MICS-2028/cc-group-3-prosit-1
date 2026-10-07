import { COUNTRIES } from '../domain/country'
import { useT } from '../i18n/context'
import { useSettings } from '../settings/context'

export function CountryPicker() {
  const { t } = useT()
  const { country, setCountry } = useSettings()
  return (
    <fieldset className="language-picker">
      <legend className="label">{t('settings.country')}</legend>
      <div className="pill-row">
        {COUNTRIES.map((code) => (
          <button
            key={code}
            type="button"
            className={code === country ? 'pill is-selected' : 'pill'}
            aria-pressed={code === country}
            onClick={() => setCountry(code)}
          >
            {t(`country.${code}`)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
