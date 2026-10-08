import { describe, expect, it } from 'vitest'
import { parsePlaceName, placeNameUrl } from './placeNameApi'

describe('parsePlaceName', () => {
  it('joins the town and its region', () => {
    expect(parsePlaceName({ address: { suburb: 'Community 22', town: 'Ashaiman', state: 'Greater Accra Region' } })).toBe('Ashaiman, Greater Accra Region')
  })

  it('falls back from town to city, village and suburb', () => {
    expect(parsePlaceName({ address: { city: 'Kumasi', state: 'Ashanti Region' } })).toBe('Kumasi, Ashanti Region')
    expect(parsePlaceName({ address: { village: 'Dodowa', state: 'Greater Accra Region' } })).toBe('Dodowa, Greater Accra Region')
    expect(parsePlaceName({ address: { state: 'Northern Region' } })).toBe('Northern Region')
  })

  it('does not repeat a name that is the same town and region', () => {
    expect(parsePlaceName({ address: { city: 'Nairobi', state: 'Nairobi' } })).toBe('Nairobi')
  })

  it('returns an empty name for anything unexpected', () => {
    expect(parsePlaceName(null)).toBe('')
    expect(parsePlaceName({ error: 'Unable to geocode' })).toBe('')
    expect(parsePlaceName({ address: { town: 42 } })).toBe('')
  })
})

describe('placeNameUrl', () => {
  it('sends only the coordinates', () => {
    const url = placeNameUrl(5.69, -0.03)
    expect(url).toContain('lat=5.69&lon=-0.03')
    expect(url).toContain('nominatim.openstreetmap.org')
  })
})
