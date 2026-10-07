import { useEffect } from 'react'
import { useCurrentUser } from '../auth/useCurrentUser'
import { readUserCache, writeUserCache } from '../lib/userCache'
import { useRemote, type RemoteState } from './useRemote'

/** Data from the server, falling back to the last copy saved on this phone when there is no signal. */
export function useCachedRemote<T>(name: string, load: () => Promise<T>, isValid: (value: unknown) => value is T) {
  const userId = useCurrentUser()?.id ?? ''
  const { state: remote, reload } = useRemote(load)

  useEffect(() => {
    if (remote.status === 'ready' && userId) writeUserCache(name, userId, remote.data)
  }, [remote, userId, name])

  const cached = remote.status !== 'ready' && userId ? readUserCache(name, userId, isValid) : null
  const state: RemoteState<T> = cached ? { status: 'ready', data: cached } : remote
  return { state, reload, stale: cached !== null }
}
