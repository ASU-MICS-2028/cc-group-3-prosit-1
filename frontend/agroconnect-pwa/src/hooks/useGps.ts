import { useCallback, useEffect, useRef, useState } from 'react'
import type { GpsFix } from '../domain/farmer'

const GOOD_ENOUGH_METRES = 15
const GIVE_UP_MS = 20_000
const PERMISSION_DENIED = 1

export type GpsStatus = 'idle' | 'working' | 'denied' | 'failed'

/**
 * GPS works without signal, but the first fix is usually rough and improves over a few
 * seconds. We keep listening and hand back the most accurate reading.
 */
export function useGps(onFix: (fix: GpsFix) => void) {
  const [status, setStatus] = useState<GpsStatus>('idle')
  const [liveAccuracy, setLiveAccuracy] = useState<number | null>(null)
  const watchId = useRef<number | null>(null)
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const best = useRef<GpsFix | null>(null)
  const onFixRef = useRef(onFix)

  useEffect(() => {
    onFixRef.current = onFix
  })

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    clearTimeout(giveUpTimer.current)
  }, [])

  const finish = useCallback(
    (failure: Exclude<GpsStatus, 'idle' | 'working'>) => {
      stop()
      setLiveAccuracy(null)
      if (best.current) {
        onFixRef.current(best.current)
        setStatus('idle')
      } else {
        setStatus(failure)
      }
    },
    [stop],
  )

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('failed')
      return
    }
    stop()
    best.current = null
    setStatus('working')

    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!best.current || coords.accuracy < best.current.accuracy) {
          best.current = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: Math.round(coords.accuracy),
            capturedAt: Date.now(),
          }
          setLiveAccuracy(best.current.accuracy)
        }
        if (coords.accuracy <= GOOD_ENOUGH_METRES) finish('failed')
      },
      (error) => finish(error.code === PERMISSION_DENIED ? 'denied' : 'failed'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: GIVE_UP_MS },
    )
    giveUpTimer.current = setTimeout(() => finish('failed'), GIVE_UP_MS)
  }, [finish, stop])

  useEffect(() => stop, [stop])

  return { status, liveAccuracy, start }
}
