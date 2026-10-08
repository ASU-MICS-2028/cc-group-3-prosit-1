import { useEffect, useMemo, type ReactNode } from 'react'
import { BottomNav, type NavItem } from '../components/BottomNav'
import { FeedbackButton } from '../components/FeedbackButton'
import { IdentityBar } from '../components/IdentityBar'
import { NavOverflowContext } from '../components/navOverflow'
import { useT } from '../i18n/context'
import { useCurrentUser } from '../auth/useCurrentUser'
import { setHeartbeatEnabled } from '../sync/heartbeat'
import { startSync } from '../sync/syncQueue'
import { useSyncTriggers } from '../sync/useSyncTriggers'
import { navLayout } from './tabs'

interface AppShellProps<T extends string> {
  items: readonly NavItem<T>[]
  active: T
  onChange: (id: T) => void
  screens: Record<T, ReactNode>
  /** Tabs that stay mounted while hidden, so a half-filled form survives a visit to another tab. */
  keepMounted?: readonly T[]
}

export function AppShell<T extends string>({ items, active, onChange, screens, keepMounted = [] }: AppShellProps<T>) {
  useSyncTriggers()
  const role = useCurrentUser()?.role
  const { language } = useT()
  const { bar, overflow } = navLayout(items, language !== 'en')
  const moreId = bar.find((item) => item.id === 'more')?.id
  const inOverflow = overflow.some((item) => item.id === active)
  const hidden = !bar.some((item) => item.id === active) && !inOverflow
  const nav = useMemo(() => ({ tabs: overflow, open: (id: string) => onChange(id as T) }), [overflow, onChange])

  useEffect(() => {
    void startSync()
  }, [])

  useEffect(() => {
    setHeartbeatEnabled(role === 'agent' || role === 'coordinator')
    return () => setHeartbeatEnabled(false)
  }, [role])

  useEffect(() => {
    if (hidden && items[0]) onChange(items[0].id)
  }, [hidden, items, onChange])

  return (
    <NavOverflowContext.Provider value={nav}>
    <div className="app">
      <IdentityBar />
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
      <BottomNav items={bar} active={inOverflow && moreId ? moreId : active} onChange={onChange} />
    </div>
    </NavOverflowContext.Provider>
  )
}
