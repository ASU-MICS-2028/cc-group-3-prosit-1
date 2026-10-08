import { useCallback, useEffect } from 'react'
import { isForecast } from '../domain/weather'
import { useCachedRemote } from '../hooks/useCachedRemote'
import { useSettings } from '../settings/context'
import { fetchForecast } from './weatherApi'

/**
 * The forecast for the phone's location, or the town the user chose. Offline it falls back to the
 * last copy saved on this phone.
 */
export function useForecast() {
  const { place, followsLocation, locate } = useSettings()
  const load = useCallback(() => fetchForecast(place), [place])

  useEffect(() => {
    if (followsLocation) locate()
  }, [followsLocation, locate])

  return { place, ...useCachedRemote(`weather:${place.id}`, load, isForecast) }
}
