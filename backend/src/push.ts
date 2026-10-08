import webpush from 'web-push'
import type { Ctx } from './context.js'
import { logger } from './logging.js'

/**
 * Web Push for things a user should hear about even with the app closed: a crop check answered, a
 * payment settled, new advice, an agent approved. Best effort: a failed push never fails the request
 * that caused it, and a subscription the push service says is gone (404/410) is deleted.
 */
export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushSender {
  publicKey: string
  /** 'gone' when the browser unsubscribed or the subscription expired. */
  send(subscription: PushSubscriptionRow, payload: string): Promise<'ok' | 'gone'>
}

export interface VapidKeys {
  public_key: string
  private_key: string
  /** mailto: or https: contact for the push services. */
  subject: string
}

export function webPushSender(keys: VapidKeys): PushSender {
  return {
    publicKey: keys.public_key,
    async send(subscription, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { vapidDetails: { subject: keys.subject, publicKey: keys.public_key, privateKey: keys.private_key }, TTL: 24 * 3600, timeout: 5000 },
        )
        return 'ok'
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) return 'gone'
        throw error
      }
    },
  }
}

type Lang = 'en' | 'tw' | 'ee'
export type NoticeKind = 'cropCheckAnswered' | 'paymentSuccessful' | 'paymentFailed' | 'newAdvice' | 'agentApproved'

const TEXT: Record<NoticeKind, Record<Lang, [string, string]>> = {
  cropCheckAnswered: {
    en: ['Your crop check has an answer', 'An extension officer replied. Open AgroConnect to read it.'],
    tw: ['Wɔabua wo nnɔbae nhwehwɛmu', 'Kuayɛ ho ɔbenfoɔ abua. Bue AgroConnect na kenkan.'],
    ee: ['Woɖo wò nuku dodokpɔ ŋu', 'Agbledɔ ŋuti aɖaŋuɖola ɖo eŋu. Ʋu AgroConnect nàxlẽe.'],
  },
  paymentSuccessful: {
    en: ['Payment successful', 'Your payment of {amount} went through.'],
    tw: ['Sika tua no kɔɔ yie', 'Wo sika tua {amount} kɔɔ yie.'],
    ee: ['Gafexexe la de edzi', 'Wò gafexexe {amount} de edzi.'],
  },
  paymentFailed: {
    en: ['Payment failed', 'Your payment of {amount} did not go through. Open the Wallet to try again.'],
    tw: ['Sika tua no ankɔ yie', 'Wo sika tua {amount} ankɔ yie. Bue sika kotoku no na san sɔ hwɛ.'],
    ee: ['Gafexexe la mede edzi o', 'Wò gafexexe {amount} mede edzi o. Ʋu gakotoku nàgate kpɔ.'],
  },
  newAdvice: {
    en: ['New farming advice', '{title}'],
    tw: ['Kuayɛ ho afotuo foforɔ', '{title}'],
    ee: ['Agbledɔ ŋuti aɖaŋuɖoɖo yeye', '{title}'],
  },
  agentApproved: {
    en: ['Your account is approved', 'You can now sign in to AgroConnect with ID {loginId}.'],
    tw: ['Wɔapene wo akawnt so', 'Afei wobɛtumi de ID {loginId} aba AgroConnect mu.'],
    ee: ['Wolɔ̃ ɖe wò account dzi', 'Àte ŋu age ɖe AgroConnect me fifia kple ID {loginId}.'],
  },
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '')

/** The user's language: the farmer record's, linked by phone; English otherwise. */
async function languageOf(ctx: Ctx, userId: string): Promise<Lang> {
  const { rows } = await ctx.db.query(
    `SELECT f.language FROM users u LEFT JOIN farmers f ON f.phone_e164 = u.phone_e164 AND u.role = 'farmer' WHERE u.id = $1`,
    [userId],
  )
  const lang = rows[0]?.language
  return lang === 'tw' || lang === 'ee' ? lang : 'en'
}

async function deliver(ctx: Ctx, subscriptions: (PushSubscriptionRow & { user_id: string })[], build: (lang: Lang) => string, langs: Map<string, Lang>) {
  const sender = ctx.push
  if (!sender) return
  for (const subscription of subscriptions) {
    try {
      const outcome = await sender.send(subscription, build(langs.get(subscription.user_id) ?? 'en'))
      if (outcome === 'gone') await ctx.db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [subscription.endpoint])
      else await ctx.db.query('UPDATE push_subscriptions SET last_used_at = now() WHERE endpoint = $1', [subscription.endpoint])
    } catch (error) {
      logger.warn({ err: error }, 'push notification failed')
    }
  }
}

const payloadFor = (kind: NoticeKind, vars: Record<string, string>, url: string) => (lang: Lang) => {
  const [title, body] = TEXT[kind][lang]
  return JSON.stringify({ title: fill(title, vars), body: fill(body, vars), url, tag: kind })
}

/** Notify one user on every browser they subscribed. Never throws. */
export async function notifyUser(ctx: Ctx, userId: string, kind: NoticeKind, vars: Record<string, string> = {}, url = '/'): Promise<void> {
  if (!ctx.push) return
  try {
    const { rows } = await ctx.db.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId])
    if (rows.length === 0) return
    const langs = new Map([[userId, await languageOf(ctx, userId)]])
    await deliver(ctx, rows as (PushSubscriptionRow & { user_id: string })[], payloadFor(kind, vars, url), langs)
  } catch (error) {
    logger.warn({ err: error }, 'push notification failed')
  }
}

/** Notify every subscribed farmer (new advice). Never throws. */
export async function notifyFarmers(ctx: Ctx, kind: NoticeKind, vars: Record<string, string> = {}, url = '/'): Promise<void> {
  if (!ctx.push) return
  try {
    const { rows } = await ctx.db.query(
      `SELECT s.*, f.language FROM push_subscriptions s JOIN users u ON u.id = s.user_id
         LEFT JOIN farmers f ON f.phone_e164 = u.phone_e164 WHERE u.role = 'farmer'`,
    )
    const langs = new Map(rows.map((row) => [row.user_id as string, (row.language === 'tw' || row.language === 'ee' ? row.language : 'en') as Lang]))
    await deliver(ctx, rows as (PushSubscriptionRow & { user_id: string })[], payloadFor(kind, vars, url), langs)
  } catch (error) {
    logger.warn({ err: error }, 'push notification failed')
  }
}
