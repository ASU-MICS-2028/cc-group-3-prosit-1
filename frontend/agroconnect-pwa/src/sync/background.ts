export const SYNC_TAG = 'agroconnect-sync'

interface SyncRegistration extends ServiceWorkerRegistration {
  sync?: { register: (tag: string) => Promise<void> }
}

/**
 * Asks the browser to wake the service worker and send the queue once there is signal, even if the app is
 * closed by then. Chrome on Android supports this; elsewhere it does nothing and the queue waits for the app.
 */
export async function scheduleBackgroundSync(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const registration = (await navigator.serviceWorker.getRegistration()) as SyncRegistration | undefined
    await registration?.sync?.register(SYNC_TAG)
  } catch {
    // Not supported, or the user turned background sync off: the app still sends when it is open.
  }
}
