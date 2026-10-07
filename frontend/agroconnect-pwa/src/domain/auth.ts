export const ROLES = ['farmer', 'agent', 'coordinator', 'admin'] as const
export type Role = (typeof ROLES)[number]
export type StaffRole = Exclude<Role, 'farmer'>

export const isStaff = (role: Role): role is StaffRole => role !== 'farmer'

export interface UserInfo {
  id: string
  role: Role
  name: string
  phone?: string
  assoc?: string
  loginId?: string | null
}

/** Farmers get a short PIN; staff hold many people's data, so theirs is longer. */
export const PIN_LENGTH: Record<Role, number> = { farmer: 4, agent: 6, coordinator: 6, admin: 6 }
export const MAX_PIN_ATTEMPTS = 5
export const OTP_LENGTH = 6

export const ASSOCIATIONS = [
  { id: 'ashaiman-ufa', name: 'Ashaiman Urban Farmers Association' },
  { id: 'ngfn', name: 'Northern Ghana Farmers Network' },
] as const

export interface PinRecord {
  salt: string
  hash: string
  iterations: number
}

/** `pin` is null for staff until they choose their offline PIN. */
export interface Session {
  key: 'current'
  user: UserInfo
  token: string
  pin: PinRecord | null
  failedPinAttempts: number
}

export type SignOutNotice = 'suspended' | 'rejected' | 'pinLockout' | 'expired'
