const ARC = 'M 20 100 A 80 80 0 0 1 180 100'

interface GaugeProps {
  /** 0 to 1 */
  value: number
  label: string
}

export function Gauge({ value, label }: GaugeProps) {
  const filled = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  return (
    <svg className="gauge" viewBox="0 0 200 110" role="img" aria-label={label}>
      <path d={ARC} className="gauge-track" pathLength="100" />
      {filled > 0 && <path d={ARC} className="gauge-fill" pathLength="100" strokeDasharray={`${filled} 100`} />}
    </svg>
  )
}
