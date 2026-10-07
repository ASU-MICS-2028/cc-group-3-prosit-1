import type { ReactElement } from 'react'

export type IconName =
  | 'home'
  | 'register'
  | 'farmers'
  | 'market'
  | 'wallet'
  | 'advice'
  | 'me'
  | 'checks'
  | 'more'
  | 'stats'
  | 'overview'
  | 'agents'
  | 'activity'
  | 'feedback'

const SHAPES: Record<IconName, ReactElement> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />,
  register: <path d="M12 5v14M5 12h14" />,
  farmers: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5" />
      <path d="M16 6.5a3 3 0 0 1 0 5.5M17.5 14.7c1.8.5 2.8 2 3 4.3" />
    </>
  ),
  market: <path d="M5 19v-8M12 19V5M19 19v-6" />,
  wallet: (
    <>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
      <path d="M16 12.5h2.5M6 6.5l9-2.5" />
    </>
  ),
  advice: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  checks: (
    <>
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  stats: <path d="M4 20h16M7.5 20v-8M12 20V6M16.5 20v-5" />,
  overview: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  agents: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8 17c.6-2 2.2-3 4-3s3.4 1 4 3" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  feedback: <path d="M4 5.5h16v10H10l-4 3.5v-3.5H4z" />,
}

export function Icon({ name, size = 26 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SHAPES[name]}
    </svg>
  )
}
