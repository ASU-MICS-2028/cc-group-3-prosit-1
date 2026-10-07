import { AUTH_URL } from '../config'
import type { UserInfo } from '../domain/auth'
import { requestJson } from '../lib/http'

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

function post<T>(path: string, body?: unknown, token?: string): Promise<T> {
  return requestJson<T>(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const startFarmer = (phone: string, forgotPin = false) =>
  post<FarmerStart>('/auth/farmer/start', { phone, forgotPin })

export const verifyFarmerOtp = (phone: string, code: string, pin: string) =>
  post<AuthResult>('/auth/farmer/verify-otp', { phone, code, pin })

export const loginFarmer = (phone: string, pin: string) => post<AuthResult>('/auth/farmer/login', { phone, pin })

export const signUpStaff = (input: StaffSignUpInput) =>
  post<{ id: string; status: string; testCode?: string }>('/auth/staff/signup', input)

export const verifyStaffPhone = (phone: string, code: string) =>
  post<{ status: string }>('/auth/staff/verify-phone', { phone, code })

export const loginStaff = (identifier: string, password: string) =>
  post<AuthResult>('/auth/staff/login', { identifier, password })

export const refreshToken = async (token: string): Promise<string> =>
  (await post<{ token: string }>('/auth/refresh', undefined, token)).token
