import { useState, type ReactNode } from 'react'
import { Farmers } from '../screens/Farmers'
import { Home } from '../screens/Home'
import { Register } from '../screens/Register'
import { Dashboard } from '../screens/shared/Dashboard'
import { More, type MoreEntry } from '../screens/shared/More'
import { CropChecks } from '../screens/staff/CropChecks'
import { AppShell } from './AppShell'
import { AGENT_TABS, COORDINATOR_TABS, type StaffTab } from './tabs'

const MORE_ENTRIES: Record<'agent' | 'coordinator', readonly MoreEntry[]> = {
  agent: ['weather', 'market', 'feedback', 'settings'],
  coordinator: ['weather', 'market', 'checks', 'feedback', 'settings'],
}

/** The app for field agents and coordinators. A coordinator swaps the Checks tab for Stats. */
export function StaffApp({ role }: { role: 'agent' | 'coordinator' }) {
  const [tab, setTab] = useState<StaffTab>('home')
  const screens: Record<StaffTab, ReactNode> = {
    home: <Home onRegister={() => setTab('register')} />,
    register: <Register onSaved={() => setTab('farmers')} />,
    farmers: <Farmers />,
    checks: <CropChecks />,
    stats: <Dashboard scope="association" />,
    more: <More entries={MORE_ENTRIES[role]} />,
  }

  return (
    <AppShell
      items={role === 'agent' ? AGENT_TABS : COORDINATOR_TABS}
      active={tab}
      onChange={setTab}
      screens={screens}
      keepMounted={['register']}
    />
  )
}
