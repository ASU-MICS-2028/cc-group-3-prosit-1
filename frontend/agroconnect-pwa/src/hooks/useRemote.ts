import { useCallback, useEffect, useState } from 'react'

export type RemoteState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T }

interface Settled<T> {
  load: () => Promise<T>
  version: number
  outcome: Exclude<RemoteState<T>, { status: 'loading' }>
}

/** Loads data once and again on `reload`. `load` must be stable (wrap it in useCallback). */
export function useRemote<T>(load: () => Promise<T>) {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => !cancelled && setSettled({ load, version, outcome: { status: 'ready', data } }),
      (error: unknown) => !cancelled && setSettled({ load, version, outcome: { status: 'error', error } }),
    )
    return () => {
      cancelled = true
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  // Loading is derived: whatever settled last belongs to a different request than the current one.
  const current = settled?.load === load && settled.version === version ? settled.outcome : null
  return { state: current ?? ({ status: 'loading' } as const), reload }
}
