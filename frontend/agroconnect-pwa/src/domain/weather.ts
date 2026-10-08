import type { CountryCode } from './country'

export interface Place {
  id: string
  name: string
  country: CountryCode
  latitude: number
  longitude: number
}

/** Place names are proper nouns, so they are not translated. The first place of each country is its default. */
export const PLACES: readonly Place[] = [
  { id: 'gh-ashaiman', name: 'Ashaiman', country: 'GH', latitude: 5.6942, longitude: -0.0338 },
  { id: 'gh-accra', name: 'Accra', country: 'GH', latitude: 5.6037, longitude: -0.187 },
  { id: 'gh-kumasi', name: 'Kumasi', country: 'GH', latitude: 6.6885, longitude: -1.6244 },
  { id: 'gh-tamale', name: 'Tamale', country: 'GH', latitude: 9.4034, longitude: -0.8424 },
  { id: 'ng-lagos', name: 'Lagos', country: 'NG', latitude: 6.5244, longitude: 3.3792 },
  { id: 'ng-kano', name: 'Kano', country: 'NG', latitude: 12.0022, longitude: 8.5919 },
  { id: 'ng-abuja', name: 'Abuja', country: 'NG', latitude: 9.0765, longitude: 7.3986 },
  { id: 'ke-nairobi', name: 'Nairobi', country: 'KE', latitude: -1.2921, longitude: 36.8219 },
  { id: 'ke-kisumu', name: 'Kisumu', country: 'KE', latitude: -0.0917, longitude: 34.768 },
  { id: 'ke-mombasa', name: 'Mombasa', country: 'KE', latitude: -4.0435, longitude: 39.6682 },
]

export const placesIn = (country: CountryCode): readonly Place[] => PLACES.filter((place) => place.country === country)

export function defaultPlace(country: CountryCode): Place {
  const [first] = placesIn(country)
  return first ?? (PLACES[0] as Place)
}

export const CONDITIONS = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'showers', 'storm'] as const
export type Condition = (typeof CONDITIONS)[number]

/** Turns a WMO weather code, as used by Open-Meteo, into one of the few conditions the app can draw and word. */
export function conditionOf(code: number): Condition {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2) return 'partly'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95 && code <= 99) return 'storm'
  return 'cloudy'
}

export interface ForecastDay {
  date: string
  condition: Condition
  max: number
  min: number
  rainChance: number
}

export interface Forecast {
  /** When the figures were measured, in the place's own time. */
  asOf: string
  current: { temperature: number; humidity: number; windKph: number; condition: Condition }
  days: ForecastDay[]
}

const isNumberArray = (value: unknown): value is number[] => Array.isArray(value) && value.every((item) => typeof item === 'number')
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

export const isForecast = (value: unknown): value is Forecast =>
  typeof value === 'object' && value !== null && 'current' in value && 'days' in value && Array.isArray((value as Forecast).days)

/** Reads an Open-Meteo reply. Anything unexpected throws, so a half-understood forecast is never shown. */
export function parseForecast(raw: unknown): Forecast {
  const data = raw as { current?: Record<string, unknown>; daily?: Record<string, unknown> } | null
  const current = data?.current
  const daily = data?.daily
  if (!current || !daily) throw new Error('The forecast reply has no current or daily section')

  const { time, temperature_2m: temperature, relative_humidity_2m: humidity, wind_speed_10m: wind, weather_code: code } = current
  if (typeof time !== 'string' || ![temperature, humidity, wind, code].every((n) => typeof n === 'number')) {
    throw new Error('The current weather is missing or malformed')
  }

  const { time: dates, weather_code: codes, temperature_2m_max: max, temperature_2m_min: min, precipitation_probability_max: rain } = daily
  if (!isStringArray(dates) || !isNumberArray(codes) || !isNumberArray(max) || !isNumberArray(min) || !isNumberArray(rain)) {
    throw new Error('The daily forecast is missing or malformed')
  }

  return {
    asOf: time,
    current: { temperature: temperature as number, humidity: humidity as number, windKph: wind as number, condition: conditionOf(code as number) },
    days: dates.map((date, i) => ({
      date,
      condition: conditionOf(codes[i] ?? 3),
      max: max[i] ?? 0,
      min: min[i] ?? 0,
      rainChance: rain[i] ?? 0,
    })),
  }
}

const RAIN_LIKELY_PERCENT = 60
const VERY_HOT_CELSIUS = 34

export type WeatherAdvice = 'rain' | 'heat'

/** A one-line tip for today, or null when nothing needs saying. */
export function weatherAdvice(forecast: Forecast): WeatherAdvice | null {
  const today = forecast.days[0]
  if (!today) return null
  if (today.rainChance >= RAIN_LIKELY_PERCENT) return 'rain'
  if (today.max >= VERY_HOT_CELSIUS) return 'heat'
  return null
}
