import { describe, expect, it } from 'vitest'
import { conditionOf, defaultPlace, parseForecast, placesIn, weatherAdvice, type Forecast } from './weather'

const reply = (overrides: { current?: object; daily?: object } = {}) => ({
  current: { time: '2026-10-07T14:15', temperature_2m: 31.4, relative_humidity_2m: 72, wind_speed_10m: 11.2, weather_code: 2, ...overrides.current },
  daily: {
    time: ['2026-10-07', '2026-10-08'],
    weather_code: [61, 0],
    temperature_2m_max: [30.1, 33],
    temperature_2m_min: [24, 23.5],
    precipitation_probability_max: [80, 10],
    ...overrides.daily,
  },
})

describe('conditionOf', () => {
  it.each([
    [0, 'clear'], [1, 'partly'], [2, 'partly'], [3, 'cloudy'], [45, 'fog'], [53, 'drizzle'],
    [63, 'rain'], [81, 'showers'], [95, 'storm'], [99, 'storm'], [71, 'cloudy'], [1234, 'cloudy'],
  ])('code %i is %s', (code, expected) => expect(conditionOf(code)).toBe(expected))
})

describe('parseForecast', () => {
  it('reads the current weather and each day', () => {
    const forecast = parseForecast(reply())
    expect(forecast.asOf).toBe('2026-10-07T14:15')
    expect(forecast.current).toEqual({ temperature: 31.4, humidity: 72, windKph: 11.2, condition: 'partly' })
    expect(forecast.days).toEqual([
      { date: '2026-10-07', condition: 'rain', max: 30.1, min: 24, rainChance: 80 },
      { date: '2026-10-08', condition: 'clear', max: 33, min: 23.5, rainChance: 10 },
    ])
  })

  it.each([
    ['no body', null],
    ['no daily section', { current: reply().current }],
    ['a text temperature', reply({ current: { temperature_2m: 'hot' } })],
    ['a short daily list', reply({ daily: { weather_code: 'x' } })],
  ])('refuses %s instead of showing half a forecast', (_name, bad) => {
    expect(() => parseForecast(bad)).toThrow()
  })
})

describe('weatherAdvice', () => {
  const forecast = (rainChance: number, max: number): Forecast => ({
    asOf: 'now',
    current: { temperature: 30, humidity: 70, windKph: 5, condition: 'clear' },
    days: [{ date: 'today', condition: 'clear', max, min: 22, rainChance }],
  })

  it('warns about likely rain first, then about heat, otherwise says nothing', () => {
    expect(weatherAdvice(forecast(60, 36))).toBe('rain')
    expect(weatherAdvice(forecast(59, 34))).toBe('heat')
    expect(weatherAdvice(forecast(20, 30))).toBeNull()
  })

  it('says nothing when there is no forecast day', () => {
    expect(weatherAdvice({ ...forecast(0, 0), days: [] })).toBeNull()
  })
})

describe('places', () => {
  it('has places in every country, and the first is the default', () => {
    expect(placesIn('GH').length).toBeGreaterThan(1)
    expect(defaultPlace('NG').country).toBe('NG')
    expect(defaultPlace('GH').name).toBe('Ashaiman')
  })
})
