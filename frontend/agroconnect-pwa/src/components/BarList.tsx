export interface BarRow {
  key: string
  label: string
  count: number
  colour?: string
}

/** Horizontal bars scaled to the largest value in the list. */
export function BarList({ rows }: { rows: readonly BarRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count))
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.key} className="bar-row">
          <span className="bar-label">{row.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(row.count / max) * 100}%`, background: row.colour ?? 'var(--green)' }} />
          </span>
          <span className="bar-count">{row.count}</span>
        </li>
      ))}
    </ul>
  )
}
