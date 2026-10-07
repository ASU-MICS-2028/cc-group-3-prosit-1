import type { ReactElement } from 'react'
import type { Condition } from '../domain/weather'

const SUN = '#F2B84B'
const CLOUD = '#B8C4BC'
const DROP = '#3E7FB5'

const SunShape = ({ cx = 32, cy = 32, r = 11 }: { cx?: number; cy?: number; r?: number }) => (
  <>
    <circle cx={cx} cy={cy} r={r} fill={SUN} />
    <path d={`M${cx} ${cy - r - 7}v-5M${cx} ${cy + r + 7}v5M${cx - r - 7} ${cy}h-5M${cx + r + 7} ${cy}h5`} stroke={SUN} strokeWidth="3" strokeLinecap="round" />
  </>
)

const CloudShape = ({ dy = 0 }: { dy?: number }) => (
  <path d={`M20 ${40 + dy}a9 9 0 0 1 1-18 12 12 0 0 1 23 3 8 8 0 0 1 0 15z`} fill={CLOUD} />
)

const SHAPES: Record<Condition, ReactElement> = {
  clear: <SunShape />,
  partly: (
    <>
      <SunShape cx={24} cy={24} r={8} />
      <CloudShape dy={4} />
    </>
  ),
  cloudy: <CloudShape dy={2} />,
  fog: <path d="M12 24h40M8 34h44M14 44h38" stroke={CLOUD} strokeWidth="5" strokeLinecap="round" />,
  drizzle: (
    <>
      <CloudShape />
      <path d="M26 46v4M38 46v4" stroke={DROP} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  rain: (
    <>
      <CloudShape />
      <path d="M22 46l-2 7M33 46l-2 7M44 46l-2 7" stroke={DROP} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  showers: (
    <>
      <CloudShape />
      <path d="M24 45l-3 9M36 45l-3 9M47 45l-3 9" stroke={DROP} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  storm: (
    <>
      <CloudShape />
      <path d="M35 40l-6 9h7l-4 9" stroke={SUN} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
}

export function WeatherIcon({ condition, size = 56 }: { condition: Condition; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {SHAPES[condition]}
    </svg>
  )
}
