const PREFIX = 'userCache:'
const keyFor = (name: string, userId: string) => `${PREFIX}${name}:${userId}`

/** Saved per user, so a shared phone never shows one person's figures to the next. */
export function readUserCache<T>(name: string, userId: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyFor(name, userId)) ?? 'null')
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeUserCache(name: string, userId: string, value: unknown): void {
  try {
    localStorage.setItem(keyFor(name, userId), JSON.stringify(value))
  } catch {
    // Storage can be full or blocked; the screen just won't work offline.
  }
}

export function clearUserCaches(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
