import type { ReactNode } from 'react'
import { BottomNav, type NavItem } from '../components/BottomNav'
import { FeedbackButton } from '../components/FeedbackButton'

interface AppShellProps<T extends string> {
  items: readonly NavItem<T>[]
  active: T
  onChange: (id: T) => void
  screens: Record<T, ReactNode>
  /** Tabs that stay mounted while hidden, so a half-filled form survives a visit to another tab. */
  keepMounted?: readonly T[]
}

export function AppShell<T extends string>({ items, active, onChange, screens, keepMounted = [] }: AppShellProps<T>) {
  return (
    <div className="app">
      {items.map(({ id }) =>
        keepMounted.includes(id) ? (
          <div key={id} hidden={id !== active}>
            {screens[id]}
          </div>
        ) : (
          id === active && <div key={id}>{screens[id]}</div>
        ),
      )}
      <FeedbackButton screen={active} />
      <BottomNav items={items} active={active} onChange={onChange} />
    </div>
  )
}
