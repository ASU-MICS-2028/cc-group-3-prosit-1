import { useCallback, useState } from 'react'
import { useT } from '../i18n/context'
import { describeAuthError } from './describeError'

/** Runs one async action at a time, tracking whether it is busy and what went wrong, in words. */
export function useSubmit() {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true)
      setError(null)
      try {
        await action()
      } catch (failure) {
        setError(describeAuthError(failure, t))
      } finally {
        setBusy(false)
      }
    },
    [t],
  )

  return { busy, error, setError, run }
}
