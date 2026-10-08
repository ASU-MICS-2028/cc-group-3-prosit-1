import { invalid } from './http.js'
import type { Row } from './db.js'

/**
 * The optional farmer profile (Prosit 1 "Real Data Requirements"): farm details, technology access,
 * financial profile, extension history and needs. One spec drives validation, the INSERT columns, the
 * API view and the CSV, so a new field is added in one place (plus migrations/ and the PWA).
 */
type Spec =
  | { column: string; kind: 'one'; values: readonly string[] }
  | { column: string; kind: 'many'; values: readonly string[] }
  | { column: string; kind: 'bool' }

export const PROFILE_FIELDS = {
  soilType: { column: 'soil_type', kind: 'one', values: ['loamy', 'sandy', 'clay', 'silt', 'unknown'] },
  seasons: { column: 'seasons', kind: 'many', values: ['major', 'minor', 'dry'] },
  phoneType: { column: 'phone_type', kind: 'one', values: ['smartphone', 'feature', 'none'] },
  dataPlan: { column: 'data_plan', kind: 'one', values: ['none', 'daily', 'weekly', 'monthly'] },
  contactChannel: { column: 'contact_channel', kind: 'one', values: ['app', 'sms', 'call', 'whatsapp', 'agent'] },
  incomeSources: { column: 'income_sources', kind: 'many', values: ['crops', 'livestock', 'trading', 'wage', 'remittance', 'other'] },
  hasBankAccount: { column: 'has_bank_account', kind: 'bool' },
  mobileMoney: { column: 'mobile_money_use', kind: 'one', values: ['none', 'sometimes', 'regular'] },
  needs: { column: 'needs', kind: 'many', values: ['inputs', 'credit', 'market', 'training', 'storage', 'irrigation', 'pests', 'weather'] },
  extensionVisit: { column: 'last_extension_visit', kind: 'one', values: ['never', 'this_year', 'over_a_year'] },
} as const satisfies Record<string, Spec>

export type ProfileField = keyof typeof PROFILE_FIELDS
const ENTRIES = Object.entries(PROFILE_FIELDS) as [ProfileField, Spec][]

/** Checks `profile` (absent, null or an object) and returns the column values in PROFILE_FIELDS order. */
export function profileColumns(profile: unknown): unknown[] {
  if (profile != null && (typeof profile !== 'object' || Array.isArray(profile))) throw invalid('profile', 'profile must be an object')
  const p = (profile ?? {}) as Record<string, unknown>
  return ENTRIES.map(([name, spec]) => {
    const value = p[name]
    const field = `profile.${name}`
    if (spec.kind === 'many') {
      if (value == null) return []
      if (!Array.isArray(value) || !value.every((v) => spec.values.includes(String(v)))) throw invalid(field, `${field} must be a list from: ${spec.values.join(', ')}`)
      return [...new Set(value.map(String))]
    }
    if (value == null) return null
    if (spec.kind === 'bool') {
      if (typeof value !== 'boolean') throw invalid(field, `${field} must be true, false or null`)
      return value
    }
    if (!spec.values.includes(String(value))) throw invalid(field, `${field} must be one of: ${spec.values.join(', ')}`)
    return value
  })
}

export const PROFILE_COLUMN_NAMES = ENTRIES.map(([, spec]) => spec.column)

export function profileView(row: Row): Record<ProfileField, unknown> {
  return Object.fromEntries(ENTRIES.map(([name, spec]) => [name, row[spec.column] ?? (spec.kind === 'many' ? [] : null)])) as Record<ProfileField, unknown>
}
