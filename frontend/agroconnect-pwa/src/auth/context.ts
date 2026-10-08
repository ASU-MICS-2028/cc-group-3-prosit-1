import { createContext, useContext } from 'react'
import type { AuthResult } from './authApi'
import type { AuthState } from './authReducer'

export type UnlockResult = { ok: true } | { ok: false; attemptsLeft: number }

export interface AuthActions {
  completeFarmerSignIn: (result: AuthResult, pin: string) => Promise<void>
  completeStaffSignIn: (result: AuthResult) => Promise<void>
  setStaffPin: (pin: string) => Promise<void>
  unlock: (pin: string) => Promise<UnlockResult>
  awaitApproval: (identifier: string, password: string) => void
  /** Signs in again with the credentials held in memory. Resolves 'pending' if still not approved. */
  checkApproval: () => Promise<'approved' | 'pending'>
  signOut: () => Promise<void>
  /** After a password/PIN change: stay signed in here with the fresh token (and re-hashed local PIN). */
  applyCredentialChange: (token: string, pin?: string) => Promise<void>
}

export interface Auth extends AuthActions {
  state: AuthState
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
