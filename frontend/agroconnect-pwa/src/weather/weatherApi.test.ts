import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkError } from '../lib/http'
import { PLACES } from '../domain/weather'
import { fetchForecast, forecastUrl } from './weatherApi'

const accra = PLACES.find((place) => place.id === 'gh-accra')!

afterEach(() => vi.unstubAllGlobals())

describe('forecastUrl', () => {
  it('asks Open-Meteo for the place, local time and five days, and sends no key', () => {
    const url = new URL(forecastUrl(accra))
    expect(url.origin).toBe('https://api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('5.6037')
    expect(url.searchParams.get('longitude')).toBe('-0.187')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('forecast_days')).toBe('5')
    expect([...url.searchParams.keys()].some((key) => /key|token/i.test(key))).toBe(false)
  })
})

describe('fetchForecast', () => {
  it('turns a reply into a forecast', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      current: { time: '2026-10-07T14:15', temperature_2m: 30, relative_humidity_2m: 70, wind_speed_10m: 8, weather_code: 0 },
      daily: { time: ['2026-10-07'], weather_code: [0], temperature_2m_max: [31], temperature_2m_min: [24], precipitation_probability_max: [5] },
    }), { status: 200 })))
    expect((await fetchForecast(accra)).current.condition).toBe('clear')
  })

  it('reports a lost connection as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(fetchForecast(accra)).rejects.toBeInstanceOf(NetworkError)
  })
})
