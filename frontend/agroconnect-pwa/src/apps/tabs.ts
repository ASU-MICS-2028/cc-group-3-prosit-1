import type { NavItem } from '../components/BottomNav'

export type FarmerTab = 'home' | 'market' | 'wallet' | 'advice' | 'me' | 'more'
export type StaffTab = 'home' | 'register' | 'farmers' | 'checks' | 'stats' | 'more'
export type AdminTab = 'overview' | 'agents' | 'farmers' | 'activity' | 'more'

export const FARMER_TABS: readonly NavItem<FarmerTab>[] = [
  { id: 'home', label: 'nav.home', icon: 'home' },
  { id: 'market', label: 'nav.market', icon: 'market' },
  { id: 'wallet', label: 'nav.wallet', icon: 'wallet' },
  { id: 'advice', label: 'nav.advice', icon: 'advice' },
  { id: 'me', label: 'nav.me', icon: 'me' },
  { id: 'more', label: 'nav.more', icon: 'more', compactOnly: true },
]

export const AGENT_TABS: readonly NavItem<StaffTab>[] = [
  { id: 'home', label: 'nav.home', icon: 'home' },
  { id: 'register', label: 'nav.register', icon: 'register' },
  { id: 'farmers', label: 'nav.farmers', icon: 'farmers' },
  { id: 'checks', label: 'nav.checks', icon: 'checks' },
  { id: 'more', label: 'nav.more', icon: 'more' },
]

/** Six tabs do not fit the nav, so a coordinator's Crop checks sit under More. */
export const COORDINATOR_TABS: readonly NavItem<StaffTab>[] = [
  { id: 'home', label: 'nav.home', icon: 'home' },
  { id: 'register', label: 'nav.register', icon: 'register' },
  { id: 'farmers', label: 'nav.farmers', icon: 'farmers' },
  { id: 'stats', label: 'nav.stats', icon: 'stats' },
  { id: 'more', label: 'nav.more', icon: 'more' },
]

export const ADMIN_TABS: readonly NavItem<AdminTab>[] = [
  { id: 'overview', label: 'nav.overview', icon: 'overview' },
  { id: 'agents', label: 'nav.agents', icon: 'agents' },
  { id: 'farmers', label: 'nav.farmers', icon: 'farmers' },
  { id: 'activity', label: 'nav.activity', icon: 'activity' },
  { id: 'more', label: 'nav.more', icon: 'more' },
]

const COMPACT_TABS = 3

export interface NavLayout<T extends string> {
  bar: readonly NavItem<T>[]
  /** Tabs that moved into More, in the order a role needs them. */
  overflow: readonly NavItem<T>[]
}

/**
 * English fits five labels. Twi and Ewe labels are longer, so their bar keeps a role's three
 * most-used tabs (the first three in each list) plus More, which holds the rest.
 */
export function navLayout<T extends string>(items: readonly NavItem<T>[], compact: boolean): NavLayout<T> {
  if (!compact) return { bar: items.filter((item) => !item.compactOnly), overflow: [] }
  const more = items.find((item) => item.id === 'more')
  const others = items.filter((item) => item.id !== 'more')
  return { bar: more ? [...others.slice(0, COMPACT_TABS), more] : others, overflow: others.slice(COMPACT_TABS) }
}
