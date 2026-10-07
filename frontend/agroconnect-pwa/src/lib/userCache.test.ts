import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearUserCaches, readUserCache, writeUserCache } from './userCache'

class MemoryStorage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

const isNumberBox = (value: unknown): value is { n: number } => typeof value === 'object' && value !== null && typeof (value as { n: unknown }).n === 'number'

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()))
afterEach(() => vi.unstubAllGlobals())

describe('user cache', () => {
  it('gives back what was saved for that user and that name', () => {
    writeUserCache('stats', 'U-1', { n: 3 })
    expect(readUserCache('stats', 'U-1', isNumberBox)).toEqual({ n: 3 })
    expect(readUserCache('wallet', 'U-1', isNumberBox)).toBeNull()
  })

  it('never shows one user the data saved for another', () => {
    writeUserCache('stats', 'U-1', { n: 3 })
    expect(readUserCache('stats', 'U-2', isNumberBox)).toBeNull()
  })

  it('ignores damaged data and data of the wrong shape', () => {
    localStorage.setItem('userCache:stats:U-1', '{not json')
    expect(readUserCache('stats', 'U-1', isNumberBox)).toBeNull()
    writeUserCache('stats', 'U-1', { n: 'three' })
    expect(readUserCache('stats', 'U-1', isNumberBox)).toBeNull()
  })

  it('clears every user\'s data on sign-out but leaves other settings alone', () => {
    writeUserCache('stats', 'U-1', { n: 1 })
    writeUserCache('wallet', 'U-2', { n: 2 })
    localStorage.setItem('country', 'GH')
    clearUserCaches()
    expect(readUserCache('stats', 'U-1', isNumberBox)).toBeNull()
    expect(readUserCache('wallet', 'U-2', isNumberBox)).toBeNull()
    expect(localStorage.getItem('country')).toBe('GH')
  })
})
