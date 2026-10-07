import { describe, expect, it } from 'vitest'
import { ROLES } from '../domain/auth'
import { ROLE_COLOUR } from './roleColours'

describe('role colours', () => {
  it('gives every role its own colour', () => {
    expect(new Set(ROLES.map((role) => ROLE_COLOUR[role])).size).toBe(ROLES.length)
  })

  it('never uses the lime that is reserved for the main button', () => {
    for (const colour of Object.values(ROLE_COLOUR)) expect(colour.toLowerCase()).not.toBe('#c6f432')
  })
})
