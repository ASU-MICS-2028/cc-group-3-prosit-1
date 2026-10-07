import { useEffect } from 'react'
import { requestSync } from './syncQueue'

const RETRY_INTERVAL_MS = 30_000

export function useSyncTriggers(): void {
  useEffect(() => {
    const trigger = () => void requestSync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger()
    }

    window.addEventListener('online', trigger)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(trigger, RETRY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', trigger)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [])
}
