import type { NavItem } from '../components/BottomNav'

export type FarmerTab = 'home' | 'market' | 'wallet' | 'advice' | 'me'
export type StaffTab = 'home' | 'register' | 'farmers' | 'checks' | 'stats' | 'more'
export type AdminTab = 'overview' | 'agents' | 'farmers' | 'activity' | 'more'

export const FARMER_TABS: readonly NavItem<FarmerTab>[] = [
  { id: 'home', label: 'nav.home', icon: 'home' },
  { id: 'market', label: 'nav.market', icon: 'market' },
  { id: 'wallet', label: 'nav.wallet', icon: 'wallet' },
  { id: 'advice', label: 'nav.advice', icon: 'advice' },
  { id: 'me', label: 'nav.me', icon: 'me' },
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
