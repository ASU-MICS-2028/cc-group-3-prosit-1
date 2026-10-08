import { requestJson } from '../lib/http'

/**
 * OpenStreetMap's reverse geocoder: free and keyless. Its usage policy allows light use, so the app asks
 * only when the phone moves to a new spot and keeps the answer. Only the rounded coordinates are sent.
 */
export function placeNameUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '12',
    'accept-language': 'en',
  })
  return `https://nominatim.openstreetmap.org/reverse?${params}`
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** "Ashaiman, Greater Accra Region", or the best part of it. Empty when the service knows nothing here. */
export function parsePlaceName(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  const { address } = body as Record<string, unknown>
  if (typeof address !== 'object' || address === null) return ''
  const fields = address as Record<string, unknown>
  const town = text(fields.town) || text(fields.city) || text(fields.village) || text(fields.suburb) || text(fields.county)
  const region = text(fields.state)
  return [town, region].filter((part, index, all) => part && all.indexOf(part) === index).join(', ')
}

export async function fetchPlaceName(latitude: number, longitude: number): Promise<string> {
  return parsePlaceName(await requestJson<unknown>(placeNameUrl(latitude, longitude)))
}
