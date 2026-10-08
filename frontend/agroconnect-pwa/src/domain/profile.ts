/**
 * The optional farmer profile asked for in the Prosit brief's "Real Data Requirements": farm details,
 * technology access, financial profile, extension history and needs. The same lists are enforced by the
 * API (backend/src/profile.ts, mock-server/profile.mjs) and the database (migration 004).
 */
export const PROFILE_OPTIONS = {
  soilType: ['loamy', 'sandy', 'clay', 'silt', 'unknown'],
  seasons: ['major', 'minor', 'dry'],
  phoneType: ['smartphone', 'feature', 'none'],
  dataPlan: ['none', 'daily', 'weekly', 'monthly'],
  contactChannel: ['app', 'sms', 'call', 'whatsapp', 'agent'],
  incomeSources: ['crops', 'livestock', 'trading', 'wage', 'remittance', 'other'],
  mobileMoney: ['none', 'sometimes', 'regular'],
  needs: ['inputs', 'credit', 'market', 'training', 'storage', 'irrigation', 'pests', 'weather'],
  extensionVisit: ['never', 'this_year', 'over_a_year'],
} as const

type Options = typeof PROFILE_OPTIONS
export type SingleField = 'soilType' | 'phoneType' | 'dataPlan' | 'contactChannel' | 'mobileMoney' | 'extensionVisit'
export type MultiField = 'seasons' | 'incomeSources' | 'needs'

export type FarmerProfile = { [K in SingleField]: Options[K][number] | null } & { [K in MultiField]: Options[K][number][] } & {
  hasBankAccount: boolean | null
}

export const EMPTY_PROFILE: FarmerProfile = {
  soilType: null,
  seasons: [],
  phoneType: null,
  dataPlan: null,
  contactChannel: null,
  incomeSources: [],
  hasBankAccount: null,
  mobileMoney: null,
  needs: [],
  extensionVisit: null,
}

/** True when nothing in the profile has been answered (older records, or a farmer who skipped it). */
export const isEmptyProfile = (profile: FarmerProfile | undefined) =>
  !profile || Object.values(profile).every((value) => value === null || (Array.isArray(value) && value.length === 0))
