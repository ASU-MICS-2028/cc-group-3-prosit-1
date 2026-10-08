import { describe, expect, it } from 'vitest'
import { ADMIN_TABS, AGENT_TABS, COORDINATOR_TABS, FARMER_TABS, navLayout } from './tabs'

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

describe('navLayout', () => {
  it('keeps the full bar in English', () => {
    expect(ids(navLayout(FARMER_TABS, false).bar)).toEqual(['home', 'market', 'wallet', 'advice', 'me'])
    expect(ids(navLayout(AGENT_TABS, false).bar)).toEqual(['home', 'register', 'farmers', 'checks', 'more'])
    expect(navLayout(ADMIN_TABS, false).overflow).toEqual([])
  })

  it('moves a farmer’s Advice and Me into More in the compact bar', () => {
    const { bar, overflow } = navLayout(FARMER_TABS, true)
    expect(ids(bar)).toEqual(['home', 'market', 'wallet', 'more'])
    expect(ids(overflow)).toEqual(['advice', 'me'])
  })

  it('keeps each staff role’s three most-used tabs and moves the rest', () => {
    expect(ids(navLayout(AGENT_TABS, true).bar)).toEqual(['home', 'register', 'farmers', 'more'])
    expect(ids(navLayout(AGENT_TABS, true).overflow)).toEqual(['checks'])
    expect(ids(navLayout(COORDINATOR_TABS, true).overflow)).toEqual(['stats'])
    expect(ids(navLayout(ADMIN_TABS, true).bar)).toEqual(['overview', 'agents', 'farmers', 'more'])
    expect(ids(navLayout(ADMIN_TABS, true).overflow)).toEqual(['activity'])
  })
})
