import { authedJson } from '../auth/authedRequest'
import { API_URL } from '../config'
import { RejectedError } from '../lib/http'

/** The record a field agent made for this farmer (GET /farmers/me), as much of it as the Me screen shows. */
export interface FarmerProfile {
  name: string
  community: string | null
  region: string | null
  crops: string[]
  farmSizeAcres: number | null
  registeredAt: string | null
}

export const isFarmerProfile = (value: unknown): value is FarmerProfile | null =>
  value === null || (typeof value === 'object' && Array.isArray((value as FarmerProfile).crops) && typeof (value as FarmerProfile).name === 'string')

/** null when no agent has registered this farmer yet (404), which is normal for a farmer who signed up alone. */
export async function fetchMyProfile(): Promise<FarmerProfile | null> {
  try {
    return await authedJson<FarmerProfile>(`${API_URL}/farmers/me`)
  } catch (error) {
    if (error instanceof RejectedError && error.status === 404) return null
    throw error
  }
}
