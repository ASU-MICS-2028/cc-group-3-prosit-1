import { createHmac, timingSafeEqual } from 'node:crypto'
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Config } from './config.js'
import { HttpError } from './http.js'
import { optionalSecret } from './secrets.js'

// SMS ---------------------------------------------------------------------------------------------

export interface Sms {
  send(phoneE164: string, message: string): Promise<void>
}

interface ArkeselSecret {
  api_key: string
  sender_id: string
  /** true accepts messages without delivering them (Arkesel's sandbox). */
  sandbox?: boolean
}

/** Arkesel SMS v2 (https://developers.arkesel.com). Recipients go without the +, as 233241234567. */
export function arkeselSms(config: Config): Sms {
  return {
    async send(phoneE164, message) {
      const secret = await optionalSecret<ArkeselSecret>(config, config.smsSecretArn)
      if (!secret?.api_key) throw new HttpError(503, 'sms_unavailable', 'Text messages cannot be sent right now. Try again later.')
      const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: { 'api-key': secret.api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: secret.sender_id, message, recipients: [phoneE164.slice(1)], ...(secret.sandbox && { sandbox: true }) }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null)
      const body = (await response?.json().catch(() => null)) as { status?: string; message?: string } | null
      if (!response?.ok || body?.status !== 'success') {
        console.error(`[sms] Arkesel refused: ${response?.status} ${body?.message ?? ''}`)
        throw new HttpError(503, 'sms_unavailable', 'Text messages cannot be sent right now. Try again later.')
      }
    },
  }
}

/** Collects messages instead of sending them (tests). */
export function memorySms(): Sms & { sent: { to: string; message: string }[] } {
  const sent: { to: string; message: string }[] = []
  return { sent, send: async (to, message) => void sent.push({ to, message }) }
}

// Photo storage ---------------------------------------------------------------------------------

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer | null>
}

/** The private media bucket. Credentials come from the instance role (IMDSv2, hop limit 2). */
export function s3Storage(config: Config & { photoBucket: string }): Storage {
  const s3 = new S3Client({ region: config.region })
  return {
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: config.photoBucket, Key: key, Body: body, ContentType: contentType }))
    },
    async get(key) {
      try {
        const { Body } = await s3.send(new GetObjectCommand({ Bucket: config.photoBucket, Key: key }))
        return Body ? Buffer.from(await Body.transformToByteArray()) : null
      } catch (error) {
        if (error instanceof NoSuchKey) return null
        throw error
      }
    },
  }
}

export function memoryStorage(): Storage {
  const objects = new Map<string, Buffer>()
  return { put: async (key, body) => void objects.set(key, body), get: async (key) => objects.get(key) ?? null }
}

// Payments: votex365 hosted checkout -------------------------------------------------------------

export type ProviderStatus = 'pending' | 'successful' | 'failed'

export interface CheckoutRequest {
  reference: string
  amount: number
  description: string
  customer: { name?: string; phone: string }
  metadata: Record<string, string>
}

export interface Checkout {
  providerRef: string
  checkoutUrl: string
  status: ProviderStatus
}

export interface WebhookEvent {
  providerRef: string
  reference: string
  status: ProviderStatus
}

export interface CheckoutProvider {
  create(request: CheckoutRequest): Promise<Checkout>
  status(providerRef: string): Promise<ProviderStatus>
  /** The verified event; 'ignored' for a genuine event we have no use for; null when the signature or timestamp is wrong. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, nowMs: number): Promise<WebhookEvent | 'ignored' | null>
}

export interface VotexSecret {
  api_key: string
  webhook_secret: string
}

interface VotexPayment {
  id: string
  reference: string
  status: 'pending' | 'paid' | 'failed'
  checkout_url?: string
}

const toStatus = (status: VotexPayment['status']): ProviderStatus => (status === 'paid' ? 'successful' : status === 'failed' ? 'failed' : 'pending')
const WEBHOOK_TOLERANCE_MS = 5 * 60_000

/**
 * votex365 partner payments (https://partners.votex365.com/docs): GHS collections through a hosted
 * checkout page. `reference` is our payment's clientId, which makes a retried create idempotent on their side.
 * Any failure to reach them is a 503, so the phone keeps the payment queued and tries again.
 */
export function votexProvider(
  config: Pick<Config, 'votexBaseUrl' | 'paymentReturnUrl'> & Partial<Config>,
  loadSecret: () => Promise<VotexSecret | null> = () => optionalSecret<VotexSecret>(config as Config, config.votexSecretArn ?? null),
): CheckoutProvider {
  const secret = async () => {
    const value = await loadSecret()
    if (!value?.api_key) throw new HttpError(503, 'payments_unavailable', 'Payments are not available right now. Try again later.')
    return value
  }

  async function call(path: string, init: RequestInit = {}): Promise<VotexPayment> {
    const { api_key } = await secret()
    const response = await fetch(`${config.votexBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${api_key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)
    const body = (await response?.json().catch(() => null)) as (VotexPayment & { detail?: { code?: string; message?: string } }) | null
    if (!response?.ok || !body) {
      console.error(`[payments] votex365 ${path}: ${response?.status} ${body?.detail?.code ?? ''} ${body?.detail?.message ?? ''}`)
      throw new HttpError(503, 'payments_unavailable', 'Payments are not available right now. Try again later.')
    }
    return body
  }

  return {
    async create({ reference, amount, description, customer, metadata }) {
      const payment = await call('/payments', {
        method: 'POST',
        body: JSON.stringify({ amount, description, reference, return_url: config.paymentReturnUrl, customer, metadata }),
      })
      return { providerRef: payment.id, checkoutUrl: payment.checkout_url ?? '', status: toStatus(payment.status) }
    },

    async status(providerRef) {
      return toStatus((await call(`/payments/${encodeURIComponent(providerRef)}`)).status)
    },

    async verifyWebhook(rawBody, headers, nowMs) {
      const { webhook_secret } = await secret()
      const timestamp = String(headers['x-votex-webhook-timestamp'] ?? '')
      const signature = String(headers['x-votex-webhook-signature'] ?? '')
      if (!/^\d+$/.test(timestamp) || Math.abs(nowMs - Number(timestamp) * 1000) > WEBHOOK_TOLERANCE_MS) return null

      const expected = createHmac('sha256', webhook_secret).update(`${timestamp}.`).update(rawBody).digest()
      const given = Buffer.from(signature, 'hex')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

      const event = JSON.parse(rawBody.toString('utf8')) as { event?: string; data?: VotexPayment }
      if (!event.data?.id || !['payment.succeeded', 'payment.failed'].includes(event.event ?? '')) return 'ignored'
      return { providerRef: event.data.id, reference: event.data.reference, status: event.event === 'payment.succeeded' ? 'successful' : 'failed' }
    },
  }
}
