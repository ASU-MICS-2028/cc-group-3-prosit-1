import { useEffect } from 'react'
import { fetchPayment } from './paymentsApi'
import { refreshPendingPayments } from './polling'

const POLL_EVERY_MS = 4000

/** While the Wallet is open, checks waiting payments every few seconds and calls `onSettled` when one finishes. */
export function usePaymentPolling(onSettled: () => void): void {
  useEffect(() => {
    let stopped = false
    const timer = setInterval(async () => {
      if (!navigator.onLine) return
      const { changed } = await refreshPendingPayments(async (id) => (await fetchPayment(id)).status)
      if (changed > 0 && !stopped) onSettled()
    }, POLL_EVERY_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [onSettled])
}
