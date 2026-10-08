import { NetworkError, RejectedError, ServerError } from '../lib/http'
import { PinUnavailableError } from './pin'
import type { TranslationKey, TranslationVars } from '../i18n/translate'

type Translate = (key: TranslationKey, vars?: TranslationVars) => string

const MESSAGE_KEYS: Record<string, TranslationKey> = {
  invalid_credentials: 'auth.error.invalid_credentials',
  wrong_pin: 'auth.error.wrong_pin',
  invalid_code: 'auth.error.invalid_code',
  code_expired: 'auth.error.code_expired',
  too_many_attempts: 'auth.error.too_many_attempts',
  locked: 'auth.error.locked',
  rate_limited: 'auth.error.rate_limited',
  phone_taken: 'auth.error.phone_taken',
  pending_verification: 'auth.error.pending_verification',
  wrong_password: 'auth.error.wrong_password',
  invalid_pin: 'auth.error.generic',
}

/** Turns a failed auth call into a sentence for the registerer, in the app language. */
export function describeAuthError(error: unknown, t: Translate): string {
  if (error instanceof NetworkError || error instanceof ServerError) return t('auth.error.network')
  if (error instanceof PinUnavailableError) return t('auth.pin.unavailable')
  if (!(error instanceof RejectedError)) return t('auth.error.generic')

  if (error.code === 'invalid_request') return error.message
  const key = MESSAGE_KEYS[error.code]
  if (!key) return t('auth.error.generic')

  const message = t(key)
  const attemptsLeft = error.details.attemptsLeft
  return typeof attemptsLeft === 'number' ? `${message} ${t('auth.pin.attemptsLeft', { n: attemptsLeft })}` : message
}
