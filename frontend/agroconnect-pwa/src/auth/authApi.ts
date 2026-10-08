import { AUTH_URL } from '../config'
import type { UserInfo } from '../domain/auth'
import { toE164 } from '../domain/phone'
import { requestJson } from '../lib/http'
import { e164OrReject } from '../lib/phoneInput'

export interface AuthResult {
  token: string
  user: UserInfo
}

export type FarmerStart =
  | { next: 'pin' }
  | { next: 'otp'; expiresInSeconds: number; testCode?: string }

export interface StaffSignUpInput {
  name: string
  phone: string
  association: string
  password: string
}

/** A staff identifier is either an agent ID or a phone number; only a phone is converted. */
function identifierFor(input: string): string {
  return toE164(input) ?? input.trim().toUpperCase()
}

function post<T>(path: string, body?: unknown, token?: string): Promise<T> {
  return requestJson<T>(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const startFarmer = async (phone: string, forgotPin = false) =>
  post<FarmerStart>('/auth/farmer/start', { phone: e164OrReject(phone), forgotPin })

export const verifyFarmerOtp = async (phone: string, code: string, pin: string) =>
  post<AuthResult>('/auth/farmer/verify-otp', { phone: e164OrReject(phone), code, pin })

export const loginFarmer = async (phone: string, pin: string) =>
  post<AuthResult>('/auth/farmer/login', { phone: e164OrReject(phone), pin })

export const signUpStaff = async (input: StaffSignUpInput) =>
  post<{ id: string; status: string; testCode?: string }>('/auth/staff/signup', { ...input, phone: e164OrReject(input.phone) })

export const verifyStaffPhone = async (phone: string, code: string) =>
  post<{ status: string }>('/auth/staff/verify-phone', { phone: e164OrReject(phone), code })

export const loginStaff = async (identifier: string, password: string) =>
  post<AuthResult>('/auth/staff/login', { identifier: identifierFor(identifier), password })

export const refreshToken = async (token: string): Promise<string> =>
  (await post<{ token: string }>('/auth/refresh', undefined, token)).token
