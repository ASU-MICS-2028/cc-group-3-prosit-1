import { useCallback } from 'react'
import { isForecast } from '../domain/weather'
import { useCachedRemote } from '../hooks/useCachedRemote'
import { useSettings } from '../settings/context'
import { fetchForecast } from './weatherApi'

/** The forecast for the chosen place, falling back to the last copy saved on this phone when offline. */
export function useForecast() {
  const { place } = useSettings()
  const load = useCallback(() => fetchForecast(place), [place])
  return { place, ...useCachedRemote(`weather:${place.id}`, load, isForecast) }
}
