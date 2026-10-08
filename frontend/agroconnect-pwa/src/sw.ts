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

// Push notifications (PWA guide). The API sends { title, body, url, tag }; see backend/src/push.ts.
interface PushData {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  const push = event as PushEvent
  let data: PushData = {}
  try {
    data = push.data?.json() as PushData
  } catch {
    data = { body: push.data?.text() }
  }
  push.waitUntil(
    self.registration.showNotification(data.title ?? 'AgroConnect', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  const click = event as NotificationEvent
  click.notification.close()
  const url = new URL((click.notification.data as { url?: string } | null)?.url ?? '/', self.location.origin).href
  click.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        if ('navigate' in open) await (open as WindowClient).navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
