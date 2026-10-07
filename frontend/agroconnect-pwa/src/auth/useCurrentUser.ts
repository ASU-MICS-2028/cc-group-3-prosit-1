import type { UserInfo } from '../domain/auth'
import { useAuth } from './context'

export function useCurrentUser(): UserInfo | null {
  const { state } = useAuth()
  return 'session' in state ? state.session.user : null
}
