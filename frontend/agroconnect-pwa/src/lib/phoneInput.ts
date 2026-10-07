import { toE164 } from '../domain/phone'
import { RejectedError } from './http'

/** The services only accept E.164 numbers, so what a person typed is converted first. A bad number is refused before any request. */
export function e164OrReject(input: string): string {
  const phone = toE164(input)
  if (!phone) throw new RejectedError('Enter a valid Ghana phone number.', 400, 'invalid_request', { field: 'phone' })
  return phone
}
