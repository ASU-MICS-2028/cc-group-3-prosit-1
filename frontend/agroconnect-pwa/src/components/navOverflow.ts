import { createContext, useContext } from 'react'
import type { NavItem } from './BottomNav'

export interface NavOverflow {
  tabs: readonly NavItem<string>[]
  open: (id: string) => void
}

const EMPTY: NavOverflow = { tabs: [], open: () => {} }

/** The tabs the bar had no room for, so More can list them. */
export const NavOverflowContext = createContext<NavOverflow>(EMPTY)

export const useNavOverflow = () => useContext(NavOverflowContext)
