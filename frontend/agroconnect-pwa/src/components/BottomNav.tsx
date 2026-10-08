import { useT } from '../i18n/context'
import type { TranslationKey } from '../i18n/translate'
import { Icon, type IconName } from './icons'

export interface NavItem<T extends string> {
  id: T
  label: TranslationKey
  icon: IconName
  /** Only in the compact bar (Twi and Ewe), where it stands for the tabs moved into it. */
  compactOnly?: boolean
}

interface BottomNavProps<T extends string> {
  items: readonly NavItem<T>[]
  active: T
  onChange: (id: T) => void
}

export function BottomNav<T extends string>({ items, active, onChange }: BottomNavProps<T>) {
  const { t } = useT()
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === active ? 'nav-tab is-active' : 'nav-tab'}
          aria-current={item.id === active ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          <span className="nav-icon">
            <Icon name={item.icon} />
          </span>
          <span className="nav-label">{t(item.label)}</span>
        </button>
      ))}
    </nav>
  )
}
