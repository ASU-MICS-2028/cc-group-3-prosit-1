import type { ReactElement } from 'react'
import type { SyncStatus } from '../domain/farmer'
import { useT } from '../i18n/context'

// Each status has its own shape as well as its own colour, so it reads in strong sunlight.
const SHAPES: Record<SyncStatus, ReactElement> = {
  saved: <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="3" />,
  sending: <path d="M12 5v10M7 11l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  sent: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />,
  attention: <path d="M12 5v9M12 18.5v.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />,
  edited: <path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />,
}

export function SyncBadge({ status, label }: { status: SyncStatus; label?: string }) {
  const { t } = useT()
  return (
    <span className={`sync-badge sync-${status}`}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {SHAPES[status]}
      </svg>
      {label ?? t(`status.${status}`)}
    </span>
  )
}
