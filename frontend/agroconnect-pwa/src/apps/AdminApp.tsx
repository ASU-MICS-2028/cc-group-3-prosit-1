import { useState, type ReactNode } from 'react'
import { Activity } from '../screens/admin/Activity'
import { AdminFarmers } from '../screens/admin/AdminFarmers'
import { Agents } from '../screens/admin/Agents'
import { Dashboard } from '../screens/shared/Dashboard'
import { More } from '../screens/shared/More'
import { AppShell } from './AppShell'
import { ADMIN_TABS, type AdminTab } from './tabs'

export function AdminApp() {
  const [tab, setTab] = useState<AdminTab>('overview')

  const screens: Record<AdminTab, ReactNode> = {
    overview: <Dashboard scope="all" />,
    agents: <Agents />,
    farmers: <AdminFarmers />,
    activity: <Activity />,
    more: <More entries={['feedback', 'settings']} />,
  }

  return <AppShell items={ADMIN_TABS} active={tab} onChange={setTab} screens={screens} />
}
