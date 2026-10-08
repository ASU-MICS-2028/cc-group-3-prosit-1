import { useEffect, useState } from 'react'
import { useT } from '../i18n/context'
import { deleteSubscription, fetchPushKey, keyBytes, saveSubscription } from '../push/pushApi'
import { Button } from './Button'

type State = 'unsupported' | 'loading' | 'off' | 'on' | 'blocked'

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/**
 * Turns push notifications on or off for this phone: crop-check answers, payment results, new advice,
 * account approval. Hidden when the browser or the server cannot do push.
 */
export function NotificationToggle() {
  const { t } = useT()
  const [state, setState] = useState<State>(supported() ? 'loading' : 'unsupported')
  const [key, setKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported()) return
    let cancelled = false
    void (async () => {
      const serverKey = await fetchPushKey()
      const registration = await navigator.serviceWorker.getRegistration()
      const existing = await registration?.pushManager.getSubscription()
      if (cancelled) return
      setKey(serverKey)
      if (!serverKey || !registration) return setState('unsupported')
      if (Notification.permission === 'denied') return setState('blocked')
      setState(existing ? 'on' : 'off')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'unsupported' || state === 'loading') return null

  async function turnOn() {
    if (!key) return
    setBusy(true)
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState('blocked')
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
      await saveSubscription(subscription.toJSON())
      setState('on')
    } catch {
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await deleteSubscription(subscription.endpoint).catch(() => undefined)
        await subscription.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">{t('push.title')}</h2>
      <p className="hint">{t('push.hint')}</p>
      {state === 'blocked' && <p className="note">{t('push.blocked')}</p>}
      {state === 'off' && (
        <Button disabled={busy} onClick={() => void turnOn()}>
          {t('push.turnOn')}
        </Button>
      )}
      {state === 'on' && (
        <>
          <p className="note">{t('push.on')}</p>
          <Button variant="text" className="on-card" disabled={busy} onClick={() => void turnOff()}>
            {t('push.turnOff')}
          </Button>
        </>
      )}
    </section>
  )
}
