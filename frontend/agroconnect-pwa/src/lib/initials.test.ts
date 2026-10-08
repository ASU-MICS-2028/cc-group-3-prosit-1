import { describe, expect, it } from 'vitest'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it('uses the first letters of the first two words', () => {
    expect(initialsOf('Efua Agent', 'Field agent')).toBe('EA')
    expect(initialsOf('  kwame   asante  mensah ', 'Farmer')).toBe('KA')
  })

  it('uses one letter for a single name', () => {
    expect(initialsOf('Efua', 'Farmer')).toBe('E')
  })

  it('falls back to the role when there is no name', () => {
    expect(initialsOf('', 'Farmer')).toBe('F')
    expect(initialsOf('   ', 'Administrator')).toBe('A')
  })

  it('keeps letters such as Ɛ and Ɔ whole', () => {
    expect(initialsOf('Ɛfua Ɔbɛng', 'Farmer')).toBe('ƐƆ')
  })
})
