import { API_URL } from '../config'
import type { Farmer } from '../domain/farmer'
import { splitPhone } from '../domain/phone'
import { parseFarmSize } from '../domain/validation'
import { RejectedError } from '../lib/http'
import { jsonPost, send, sendJson } from './send'

export { NetworkError, RejectedError, ServerError, UnauthorizedError } from '../lib/http'

function toPayload(farmer: Farmer) {
  const phone = splitPhone(farmer.phone)
  if (!phone) throw new RejectedError('The phone number is not a valid Ghana number', 400, 'invalid_request')

  return {
    clientId: farmer.clientId,
    name: farmer.name,
    countryCode: phone.countryCode,
    phoneNational: phone.phoneNational,
    preferredLanguage: farmer.preferredLanguage,
    gender: farmer.gender ?? null,
    community: farmer.community,
    region: farmer.region,
    farmSizeAcres: parseFarmSize(farmer.farmSizeAcres),
    crops: farmer.crops,
    gps: farmer.gps && { ...farmer.gps, capturedAt: new Date(farmer.gps.capturedAt).toISOString() },
    consent: farmer.consent,
    registeredAt: new Date(farmer.createdAt).toISOString(),
  }
}

/** Returns the server's ID for the farmer. */
export async function postFarmer(farmer: Farmer): Promise<string> {
  const { id } = await sendJson<{ id: string | number }>(`${API_URL}/farmers`, jsonPost(toPayload(farmer)))
  return String(id)
}

export async function postPhoto(serverId: string, photo: Blob): Promise<void> {
  await send(`${API_URL}/farmers/${encodeURIComponent(serverId)}/photo`, {
    method: 'POST',
    headers: { 'Content-Type': photo.type || 'image/jpeg' },
    body: photo,
  })
}
