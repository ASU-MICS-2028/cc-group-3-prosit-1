import { describe, expect, it } from 'vitest'
import { hashPin, isValidPin, verifyPin } from './pin'

describe('PIN hashing', () => {
  it('accepts the right PIN and rejects a wrong one', async () => {
    const record = await hashPin('482193')
    expect(await verifyPin('482193', record)).toBe(true)
    expect(await verifyPin('482194', record)).toBe(false)
  })

  it('stores a different hash each time, because the salt differs', async () => {
    const [first, second] = await Promise.all([hashPin('1234'), hashPin('1234')])
    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })

  it('never stores the PIN itself', async () => {
    expect(JSON.stringify(await hashPin('1234'))).not.toContain('1234')
  })
})

describe('isValidPin', () => {
  it('requires exactly the right number of digits', () => {
    expect(isValidPin('1234', 4)).toBe(true)
    expect(isValidPin('123', 4)).toBe(false)
    expect(isValidPin('12345', 4)).toBe(false)
    expect(isValidPin('12a4', 4)).toBe(false)
  })
})
