import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { MAX_PIN_ATTEMPTS, type Session } from '../domain/auth'
import { RejectedError } from '../lib/http'
import { loginStaff, refreshToken, type AuthResult } from './authApi'
import { authReducer, initialAuthState } from './authReducer'
import { setTokenProvider } from './authedRequest'
import { AuthContext, type Auth, type AuthActions } from './context'
import { hashPin, verifyPin } from './pin'
import { clearSession, getSession, saveSession } from './sessionRepository'

const BLOCKING_CODES = ['suspended', 'rejected'] as const

function newSession(result: AuthResult, pin: Session['pin']): Session {
  return { key: 'current', user: result.user, token: result.token, pin, failedPinAttempts: 0 }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState)
  const stateRef = useRef(state)
  const refreshing = useRef<Promise<string | null> | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let cancelled = false
    void getSession().then((session) => {
      if (!cancelled) dispatch({ type: 'loaded', session: session ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const current = stateRef.current
    if (!('session' in current)) return null
    try {
      const token = await refreshToken(current.session.token)
      const latest = stateRef.current
      if (!('session' in latest)) return null
      await saveSession({ ...latest.session, token })
      dispatch({ type: 'tokenRefreshed', token })
      return token
    } catch (error) {
      if (!(error instanceof RejectedError)) return null
      const blocked = error.status === 403 ? BLOCKING_CODES.find((code) => code === error.code) : undefined
      if (blocked) {
        await clearSession()
        dispatch({ type: 'signedOut', notice: blocked })
      } else if (error.status === 401) {
        await clearSession()
        dispatch({ type: 'signedOut', notice: 'expired' })
      }
      return null
    }
  }, [])

  const refresh = useCallback(() => {
    refreshing.current ??= doRefresh().finally(() => {
      refreshing.current = null
    })
    return refreshing.current
  }, [doRefresh])

  useEffect(() => {
    setTokenProvider({
      getToken: () => (stateRef.current.status === 'signedIn' ? stateRef.current.session.token : null),
      refresh,
    })
    return () => setTokenProvider(null)
  }, [refresh])

  const signedIn = state.status === 'signedIn'
  useEffect(() => {
    if (!signedIn) return
    const run = () => {
      if (navigator.onLine) void refresh()
    }
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [signedIn, refresh])

  const actions = useMemo<AuthActions>(
    () => ({
      async completeFarmerSignIn(result, pin) {
        const session = newSession(result, await hashPin(pin))
        await saveSession(session)
        dispatch({ type: 'signedIn', session })
      },

      async completeStaffSignIn(result) {
        const session = newSession(result, null)
        await saveSession(session)
        dispatch({ type: 'signedIn', session })
      },

      async setStaffPin(pin) {
        const current = stateRef.current
        if (current.status !== 'settingPin') return
        const session = { ...current.session, pin: await hashPin(pin) }
        await saveSession(session)
        dispatch({ type: 'pinSet', session })
      },

      async unlock(pin) {
        const current = stateRef.current
        if (current.status !== 'locked' || !current.session.pin) return { ok: false, attemptsLeft: 0 }

        if (await verifyPin(pin, current.session.pin)) {
          const session = { ...current.session, failedPinAttempts: 0 }
          await saveSession(session)
          dispatch({ type: 'unlocked', session })
          return { ok: true }
        }

        const failedPinAttempts = current.session.failedPinAttempts + 1
        if (failedPinAttempts >= MAX_PIN_ATTEMPTS) {
          await clearSession()
          dispatch({ type: 'signedOut', notice: 'pinLockout' })
          return { ok: false, attemptsLeft: 0 }
        }
        const session = { ...current.session, failedPinAttempts }
        await saveSession(session)
        dispatch({ type: 'pinFailed', session })
        return { ok: false, attemptsLeft: MAX_PIN_ATTEMPTS - failedPinAttempts }
      },

      awaitApproval(identifier, password) {
        dispatch({ type: 'awaitApproval', identifier, password })
      },

      async checkApproval() {
        const current = stateRef.current
        if (current.status !== 'waitingApproval') return 'pending'
        try {
          const result = await loginStaff(current.identifier, current.password)
          const session = newSession(result, null)
          await saveSession(session)
          dispatch({ type: 'signedIn', session })
          return 'approved'
        } catch (error) {
          if (!(error instanceof RejectedError)) throw error
          if (error.status !== 403) throw error
          if (error.code === 'pending_approval') return 'pending'
          const blocked = BLOCKING_CODES.find((code) => code === error.code)
          if (!blocked) throw error
          dispatch({ type: 'signedOut', notice: blocked })
          return 'pending'
        }
      },

      async signOut() {
        await clearSession()
        dispatch({ type: 'signedOut' })
      },
    }),
    [],
  )

  const value = useMemo<Auth>(() => ({ state, ...actions }), [state, actions])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
