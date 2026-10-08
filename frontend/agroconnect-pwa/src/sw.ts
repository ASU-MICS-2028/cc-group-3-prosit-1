/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { refreshToken } from './auth/authApi'
import { setTokenProvider } from './auth/authedRequest'
import { getSession, saveSession } from './auth/sessionRepository'
import { SYNC_TAG } from './sync/background'
import { requestSync } from './sync/syncQueue'

declare const self: ServiceWorkerGlobalScope

interface SyncEvent extends ExtendableEvent {
  readonly tag: string
}

// The same offline behaviour as before: every app file is saved on the phone and served from there,
// and a new version takes over as soon as it is downloaded.
self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

/** Sends the queue with the saved session's token. Signed out means nothing is sent until the next sign-in. */
async function backgroundSync(): Promise<void> {
  const session = await getSession()
  if (!session) return

  let token = session.token
  setTokenProvider({
    getToken: () => token,
    refresh: async () => {
      try {
        token = await refreshToken(token)
      } catch {
        return null
      }
      const latest = await getSession()
      if (latest) await saveSession({ ...latest, token })
      return token
    },
  })

  // Failing the event tells the browser to wake us again later, with its own back-off.
  if (await requestSync()) throw new Error('Some items are still waiting to send')
}

self.addEventListener('sync', (event) => {
  const sync = event as SyncEvent
  if (sync.tag === SYNC_TAG) sync.waitUntil(backgroundSync())
})
