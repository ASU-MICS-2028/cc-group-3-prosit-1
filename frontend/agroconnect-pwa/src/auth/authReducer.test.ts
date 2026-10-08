import { describe, expect, it } from 'vitest'
import type { Session } from '../domain/auth'
import { authReducer, initialAuthState, type AuthState } from './authReducer'

const pin = { salt: 's', hash: 'h', iterations: 1 }
const farmer: Session = { key: 'current', user: { id: 'F-1', role: 'farmer', name: '' }, token: 't1', pin, failedPinAttempts: 0 }
const newAgent: Session = { ...farmer, user: { id: 'U-1', role: 'agent', name: 'Efua' }, pin: null }

describe('authReducer', () => {
  it('starts loading', () => {
    expect(initialAuthState).toEqual({ status: 'loading' })
  })

  it('signs out when no session was saved', () => {
    expect(authReducer(initialAuthState, { type: 'loaded', session: null })).toEqual({ status: 'signedOut' })
  })

  it('opens a saved session on the PIN screen, never straight into the app', () => {
    expect(authReducer(initialAuthState, { type: 'loaded', session: farmer })).toEqual({ status: 'locked', session: farmer })
  })

  it('makes a staff member without a PIN choose one, even after a restart', () => {
    expect(authReducer(initialAuthState, { type: 'loaded', session: newAgent }).status).toBe('settingPin')
    expect(authReducer({ status: 'signedOut' }, { type: 'signedIn', session: newAgent }).status).toBe('settingPin')
  })

  it('goes straight in after a fresh sign-in that already has a PIN', () => {
    expect(authReducer({ status: 'signedOut' }, { type: 'signedIn', session: farmer }).status).toBe('signedIn')
  })

  it('moves from setting a PIN to signed in', () => {
    const withPin = { ...newAgent, pin }
    expect(authReducer({ status: 'settingPin', session: newAgent }, { type: 'pinSet', session: withPin })).toEqual({
      status: 'signedIn',
      session: withPin,
    })
  })

  it('stays locked after a wrong PIN, with the updated attempt count', () => {
    const failed = { ...farmer, failedPinAttempts: 2 }
    expect(authReducer({ status: 'locked', session: farmer }, { type: 'pinFailed', session: failed })).toEqual({
      status: 'locked',
      session: failed,
    })
  })

  it('swaps in a refreshed token without changing the screen', () => {
    const state: AuthState = { status: 'signedIn', session: farmer }
    expect(authReducer(state, { type: 'tokenRefreshed', token: 't2' })).toEqual({
      status: 'signedIn',
      session: { ...farmer, token: 't2' },
    })
    expect(authReducer({ status: 'signedOut' }, { type: 'tokenRefreshed', token: 't2' })).toEqual({ status: 'signedOut' })
  })

  it('carries the reason when a user is signed out', () => {
    expect(authReducer({ status: 'signedIn', session: farmer }, { type: 'signedOut', notice: 'suspended' })).toEqual({
      status: 'signedOut',
      notice: 'suspended',
    })
  })
})
