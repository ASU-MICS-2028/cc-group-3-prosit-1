import { HttpError } from './http.mjs'

/** The optional farmer profile (API-CONTRACT "profile"), same rules as backend/src/profile.ts. */
export const PROFILE_FIELDS = {
  soilType: { kind: 'one', values: ['loamy', 'sandy', 'clay', 'silt', 'unknown'] },
  seasons: { kind: 'many', values: ['major', 'minor', 'dry'] },
  phoneType: { kind: 'one', values: ['smartphone', 'feature', 'none'] },
  dataPlan: { kind: 'one', values: ['none', 'daily', 'weekly', 'monthly'] },
  contactChannel: { kind: 'one', values: ['app', 'sms', 'call', 'whatsapp', 'agent'] },
  incomeSources: { kind: 'many', values: ['crops', 'livestock', 'trading', 'wage', 'remittance', 'other'] },
  hasBankAccount: { kind: 'bool' },
  mobileMoney: { kind: 'one', values: ['none', 'sometimes', 'regular'] },
  needs: { kind: 'many', values: ['inputs', 'credit', 'market', 'training', 'storage', 'irrigation', 'pests', 'weather'] },
  extensionVisit: { kind: 'one', values: ['never', 'this_year', 'over_a_year'] },
}

const missing = (value) => value === null || value === undefined
const invalid = (field, message) => new HttpError(400, 'invalid_request', message, { field })

/** Returns the normalised profile (every field present), or throws 400 with the field to fix. */
export function normaliseProfile(profile) {
  if (!missing(profile) && (typeof profile !== 'object' || Array.isArray(profile))) throw invalid('profile', 'profile must be an object')
  const p = missing(profile) ? {} : profile
  return Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([name, spec]) => {
    const value = p[name]
    const field = `profile.${name}`
    if (spec.kind === 'many') {
      if (missing(value)) return [name, []]
      if (!Array.isArray(value) || !value.every((v) => spec.values.includes(String(v)))) throw invalid(field, `${field} must be a list from: ${spec.values.join(', ')}`)
      return [name, [...new Set(value.map(String))]]
    }
    if (missing(value)) return [name, null]
    if (spec.kind === 'bool') {
      if (typeof value !== 'boolean') throw invalid(field, `${field} must be true, false or null`)
      return [name, value]
    }
    if (!spec.values.includes(String(value))) throw invalid(field, `${field} must be one of: ${spec.values.join(', ')}`)
    return [name, value]
  }))
}

export const PROFILE_BREAKDOWNS = {
  byPhoneType: 'phoneType',
  byContactChannel: 'contactChannel',
  byMobileMoney: 'mobileMoney',
  byNeed: 'needs',
  bySoilType: 'soilType',
  byExtensionVisit: 'extensionVisit',
}

export const profileCell = (value) => (Array.isArray(value) ? value.join(';') : typeof value === 'boolean' ? (value ? 'yes' : 'no') : (value ?? ''))
