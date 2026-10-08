import { useState, type ReactNode } from 'react'
import { Advice } from '../screens/farmer/Advice'
import { FarmerHome } from '../screens/farmer/FarmerHome'
import { FarmerMarket } from '../screens/farmer/FarmerMarket'
import { Me } from '../screens/farmer/Me'
import { More } from '../screens/shared/More'
import { Wallet } from '../screens/farmer/Wallet'
import { AppShell } from './AppShell'
import { FARMER_TABS, type FarmerTab } from './tabs'

/** A notification tap opens /?tab=advice or /?tab=wallet; start on that tab, then tidy the address bar. */
function initialTab(): FarmerTab {
  const tab = new URLSearchParams(window.location.search).get('tab')
  const valid = FARMER_TABS.some((item) => item.id === tab)
  if (tab) window.history.replaceState(null, '', window.location.pathname)
  return valid ? (tab as FarmerTab) : 'home'
}

export function FarmerApp() {
  const [tab, setTab] = useState<FarmerTab>(initialTab)

  const screens: Record<FarmerTab, ReactNode> = {
    home: <FarmerHome onGo={setTab} />,
    market: <FarmerMarket />,
    wallet: <Wallet />,
    advice: <Advice />,
    me: <Me />,
    more: <More entries={['settings']} />,
  }

  return <AppShell items={FARMER_TABS} active={tab} onChange={setTab} screens={screens} />
}
