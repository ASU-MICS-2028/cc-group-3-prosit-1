import type { RegistrationFields, RegistrationStep } from './farmer'

export type FieldName = 'name' | 'phone' | 'farmSize' | 'consent'
export type ValidationError = 'nameRequired' | 'phoneInvalid' | 'farmSizeInvalid' | 'consentRequired'
export type FieldErrors = Partial<Record<FieldName, ValidationError>>

const PHONE_PATTERN = /^(\+233|233|0)\d{9}$/
const FARM_SIZE_PATTERN = /^\d+([.,]\d+)?$/

export function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '')
}

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(cleanPhone(phone))
}

export function parseFarmSize(text: string): number | null {
  const trimmed = text.trim()
  return FARM_SIZE_PATTERN.test(trimmed) ? Number(trimmed.replace(',', '.')) : null
}

export function validateStep(step: RegistrationStep, fields: RegistrationFields): FieldErrors {
  const errors: FieldErrors = {}
  if (step === 1) {
    if (!fields.name.trim()) errors.name = 'nameRequired'
    if (!isValidPhone(fields.phone)) errors.phone = 'phoneInvalid'
  }
  if (step === 2) {
    const size = fields.farmSizeAcres.trim()
    if (size && parseFarmSize(size) === null) errors.farmSize = 'farmSizeInvalid'
  }
  if (step === 3 && !fields.consent) errors.consent = 'consentRequired'
  return errors
}

export function validateAll(fields: RegistrationFields): FieldErrors {
  return {
    ...validateStep(1, fields),
    ...validateStep(2, fields),
    ...validateStep(3, fields),
  }
}

export function firstStepWithError(errors: FieldErrors): RegistrationStep {
  if (errors.name || errors.phone) return 1
  if (errors.farmSize) return 2
  return 3
}

export function normaliseFields<T extends RegistrationFields>(fields: T): T {
  return {
    ...fields,
    name: fields.name.trim(),
    phone: cleanPhone(fields.phone),
    community: fields.community.trim(),
    farmSizeAcres: fields.farmSizeAcres.trim().replace(',', '.'),
  }
}

export function parsePositiveNumber(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}
