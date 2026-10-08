import { describe, expect, it } from 'vitest'
import { keyBytes } from './pushApi'

describe('keyBytes', () => {
  it('decodes base64url, padding included or not', () => {
    expect([...keyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
    expect([...keyBytes('AQID_-8=')]).toEqual([1, 2, 3, 255, 239])
  })
})
