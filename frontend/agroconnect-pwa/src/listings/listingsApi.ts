import { authedJson } from '../auth/authedRequest'
import { LISTINGS_URL } from '../config'
import type { CropId } from '../domain/farmer'
import type { ListingView } from '../domain/listings'

export async function fetchListings(crop?: CropId): Promise<ListingView[]> {
  const query = crop ? `?crop=${crop}` : ''
  return (await authedJson<{ items: ListingView[] }>(`${LISTINGS_URL}/listings${query}`)).items
}

export function closeListing(id: string): Promise<{ id: string; status: string }> {
  return authedJson(`${LISTINGS_URL}/listings/${encodeURIComponent(id)}/close`, { method: 'POST' })
}
