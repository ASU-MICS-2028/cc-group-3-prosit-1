import type { Session, SignOutNotice } from '../domain/auth'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice?: SignOutNotice }
  | { status: 'settingPin'; session: Session }
  | { status: 'locked'; session: Session }
  | { status: 'signedIn'; session: Session }
  | { status: 'waitingApproval'; identifier: string; password: string }

export type AuthAction =
  | { type: 'loaded'; session: Session | null }
  | { type: 'signedIn'; session: Session }
  | { type: 'pinSet'; session: Session }
  | { type: 'unlocked'; session: Session }
  | { type: 'pinFailed'; session: Session }
  | { type: 'tokenRefreshed'; token: string }
  | { type: 'awaitApproval'; identifier: string; password: string }
  | { type: 'signedOut'; notice?: SignOutNotice }

export const initialAuthState: AuthState = { status: 'loading' }

/** A session with no PIN yet (a staff member's first sign-in) must choose one before using the app. */
const afterSignIn = (session: Session): AuthState =>
  session.pin ? { status: 'signedIn', session } : { status: 'settingPin', session }

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'loaded':
      if (!action.session) return { status: 'signedOut' }
      return action.session.pin ? { status: 'locked', session: action.session } : { status: 'settingPin', session: action.session }
    case 'signedIn':
      return afterSignIn(action.session)
    case 'pinSet':
    case 'unlocked':
      return { status: 'signedIn', session: action.session }
    case 'pinFailed':
      return { status: 'locked', session: action.session }
    case 'tokenRefreshed':
      return 'session' in state ? { ...state, session: { ...state.session, token: action.token } } : state
    case 'awaitApproval':
      return { status: 'waitingApproval', identifier: action.identifier, password: action.password }
    case 'signedOut':
      return { status: 'signedOut', notice: action.notice }
  }
}
