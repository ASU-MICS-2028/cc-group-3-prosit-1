import { useSyncExternalStore } from 'react'

/**
 * "Add to Home Screen" without the browser menu (PWA guide: "simple install prompt"). Chrome fires
 * beforeinstallprompt once, possibly before React has mounted, so the event is caught here at startup and
 * kept until the farmer taps Install. iPhones have no such event: they get written instructions instead.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

export type InstallState = 'installable' | 'ios' | 'none'

/** 'installable' (Chrome can prompt), 'ios' (show instructions), or 'none' (installed, or not possible). */
export function useInstallState(): InstallState {
  const ready = useSyncExternalStore(subscribe, () => deferred !== null, () => false)
  if (isStandalone()) return 'none'
  if (ready) return 'installable'
  return isIos() ? 'ios' : 'none'
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  notify()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}
