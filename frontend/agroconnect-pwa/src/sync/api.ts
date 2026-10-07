import { authedRequest } from '../auth/authedRequest'
import { API_URL } from '../config'
import type { Farmer } from '../domain/farmer'
import { parseFarmSize } from '../domain/validation'
import { RejectedError, ServerError } from '../lib/http'

export { NetworkError, RejectedError, ServerError, UnauthorizedError } from '../lib/http'

/** Rate limiting means "slow down", which for a queue is the same as "try again later". */
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await authedRequest(`${API_URL}${path}`, init)
  } catch (error) {
    if (error instanceof RejectedError && error.status === 429) throw new ServerError(error.message)
    throw error
  }
}

function toPayload(farmer: Farmer) {
  return {
    clientId: farmer.clientId,
    name: farmer.name,
    phone: farmer.phone,
    preferredLanguage: farmer.preferredLanguage,
    gender: farmer.gender ?? null,
    community: farmer.community,
    region: farmer.region,
    farmSizeAcres: parseFarmSize(farmer.farmSizeAcres),
    crops: farmer.crops,
    gps: farmer.gps,
    consent: farmer.consent,
    registeredAt: new Date(farmer.createdAt).toISOString(),
  }
}

/** Returns the server's ID for the farmer. */
export async function postFarmer(farmer: Farmer): Promise<string> {
  const response = await send('/farmers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toPayload(farmer)),
  })
  const { id } = (await response.json()) as { id: string | number }
  return String(id)
}

export async function postPhoto(serverId: string, photo: Blob): Promise<void> {
  await send(`/farmers/${encodeURIComponent(serverId)}/photo`, {
    method: 'POST',
    headers: { 'Content-Type': photo.type || 'image/jpeg' },
    body: photo,
  })
}
