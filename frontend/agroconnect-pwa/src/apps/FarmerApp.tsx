import { useState, type ReactNode } from 'react'
import { Advice } from '../screens/farmer/Advice'
import { FarmerHome } from '../screens/farmer/FarmerHome'
import { FarmerMarket } from '../screens/farmer/FarmerMarket'
import { Me } from '../screens/farmer/Me'
import { Wallet } from '../screens/farmer/Wallet'
import { AppShell } from './AppShell'
import { FARMER_TABS, type FarmerTab } from './tabs'

export function FarmerApp() {
  const [tab, setTab] = useState<FarmerTab>('home')

  const screens: Record<FarmerTab, ReactNode> = {
    home: <FarmerHome onGo={setTab} />,
    market: <FarmerMarket />,
    wallet: <Wallet />,
    advice: <Advice />,
    me: <Me />,
  }

  return <AppShell items={FARMER_TABS} active={tab} onChange={setTab} screens={screens} />
}
