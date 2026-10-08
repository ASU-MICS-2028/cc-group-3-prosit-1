import { useT } from '../i18n/context'
import type { TranslationKey } from '../i18n/translate'

interface ChoiceChipsProps<T extends string> {
  legend: TranslationKey
  options: readonly T[]
  /** Translation key prefix: option `x` is shown as t(`${prefix}.x`). */
  prefix: string
  /** One value, or a list for multiple choice. */
  value: T | null | readonly T[]
  onChange: (value: T | null | T[]) => void
  hint?: TranslationKey
}

/** A question answered by tapping pills: single choice (tap again to clear) or, with an array value, multiple. */
export function ChoiceChips<T extends string>({ legend, options, prefix, value, onChange, hint }: ChoiceChipsProps<T>) {
  const { t } = useT()
  const multiple = Array.isArray(value)
  const selected = (option: T) => (multiple ? (value as readonly T[]).includes(option) : value === option)

  function toggle(option: T) {
    if (multiple) {
      const list = value as readonly T[]
      onChange(list.includes(option) ? list.filter((item) => item !== option) : [...list, option])
    } else {
      onChange(value === option ? null : option)
    }
  }

  return (
    <fieldset className="field">
      <legend className="label">{t(legend)}</legend>
      {hint && <p className="hint">{t(hint)}</p>}
      <div className="pill-row">
        {options.map((option) => (
          <button key={option} type="button" className={selected(option) ? 'pill is-selected' : 'pill'} aria-pressed={selected(option)} onClick={() => toggle(option)}>
            {t(`${prefix}.${option}` as TranslationKey)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
