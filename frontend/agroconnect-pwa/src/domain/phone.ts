const GHANA_CODE = '+233'
const GHANA_NUMBER = /^(?:\+233|233|0)(\d{9})$/

export interface PhoneParts {
  countryCode: string
  /** Digits only, without the trunk-prefix 0. */
  phoneNational: string
}

/** Accepts 0241234567, 233241234567 and +233 24 123 4567; returns null for anything else. */
export function splitPhone(input: string): PhoneParts | null {
  const national = GHANA_NUMBER.exec(input.replace(/[\s\-().]/g, ''))?.[1]
  return national ? { countryCode: GHANA_CODE, phoneNational: national } : null
}

export function toE164(input: string): string | null {
  const parts = splitPhone(input)
  return parts ? parts.countryCode + parts.phoneNational : null
}
