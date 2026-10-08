import express, { type Express } from 'express'
import { actorOf, auditEvent, CURRENCIES, nowDate, type Ctx } from '../context.js'
import { iso, num, pgError, type Row } from '../db.js'
import { HttpError, invalid, jsonBody, notFound, route } from '../http.js'
import { isE164, isUuid, requireAuth, type Claims } from '../security.js'
import { pageParams, totalOf } from '../pagination.js'
import { accraDay, csvResponse, dateRange, inRange, type DayRange } from '../time.js'
import { notifyUser } from '../push.js'

const NETWORKS: Record<string, string[]> = { GHS: ['mtn', 'telecel', 'airteltigo'], KES: ['mpesa'], NGN: ['bank_transfer'] }
const DIRECTIONS = ['collect', 'payout']
const MAX_PAYMENT = 10_000
const MAX_LOAN = 50_000
const MAX_PURPOSE_LENGTH = 200
const STAFF = ['agent', 'coordinator', 'admin'] as const
const REPORTERS = ['admin', 'coordinator'] as const
/** A pending votex365 payment is re-checked with them at most this often when the phone polls. */
const PROVIDER_RECHECK_MS = 10_000

const round = (amount: number) => Math.round(amount * 100) / 100
const SYSTEM = { sub: 'votex365', role: 'system' }

/**
 * Each payment row joined to its farmer's login account and, through the phone number, to the farmer
 * record and the agent who registered it, which is what decides who may see it.
 */
const PAYMENT_SELECT = `
  SELECT p.*, u.name AS user_name, u.phone_e164 AS user_phone, f.id AS record_id, f.name AS record_name,
         f.created_by AS registrar_id, reg.association_id AS registrar_assoc
    FROM payments p
    JOIN users u ON u.id = p.farmer_user_id
    LEFT JOIN farmers f ON f.phone_e164 = u.phone_e164
    LEFT JOIN users reg ON reg.id = f.created_by`

export function paymentTools(ctx: Ctx) {
  const { db, settings } = ctx

  /**
   * Payments the provider cannot make (payouts, NGN, KES; or every payment when votex365 is not configured)
   * are simulated as in the test-mode contract: pending for `paymentDelayMs`, then successful, except that a
   * number ending in 0000 fails so both outcomes can be shown. Settled lazily before any read.
   */
  async function settleSimulated(): Promise<void> {
    await db.tx(SYSTEM, (q) =>
      q.query(
        `UPDATE payments SET status = CASE WHEN phone_e164 LIKE '%0000' THEN 'failed' ELSE 'successful' END
          WHERE provider = 'simulated' AND status = 'pending' AND created_at <= $1`,
        [new Date(ctx.now() - settings.paymentDelayMs)],
      ),
    )
  }

  const view = (p: Row) => ({
    id: p.id,
    clientId: p.client_id,
    direction: p.direction,
    amount: num(p.amount),
    currency: p.currency,
    network: p.network,
    phone: p.phone_e164,
    status: p.status,
    createdAt: iso(p.created_at),
    checkoutUrl: p.status === 'pending' ? p.checkout_url : null,
  })

  /** Admins see everything, a coordinator their association's farmers, an agent only farmers they registered. */
  function canSee(claims: Claims, p: Row): boolean {
    if (claims.role === 'admin') return true
    if (claims.role === 'coordinator') return p.registrar_assoc === claims.assoc
    return claims.role === 'agent' && p.registrar_id === claims.sub
  }

  async function scoped(claims: Claims, range: DayRange = { from: null, to: null }) {
    await settleSimulated()
    const { rows } = await db.query(`${PAYMENT_SELECT} ORDER BY p.seq DESC`)
    return rows.filter((p) => canSee(claims, p) && inRange(accraDay(p.created_at), range))
  }

  /** received = paid out to the farmer, paid = collected from them; only successful payments count. */
  function balanceOf(payments: Row[]) {
    const totals = new Map<string, { currency: string; received: number; paid: number }>()
    for (const p of payments.filter((payment) => payment.status === 'successful')) {
      const row = totals.get(p.currency) ?? { currency: p.currency, received: 0, paid: 0 }
      if (p.direction === 'payout') row.received += Number(p.amount)
      else row.paid += Number(p.amount)
      totals.set(p.currency, row)
    }
    return [...totals.values()].map((row) => ({ currency: row.currency, received: round(row.received), paid: round(row.paid), amount: round(row.received - row.paid) }))
  }

  const totalsByCurrency = async (claims: Claims, range: DayRange) =>
    balanceOf(await scoped(claims, range)).map((row) => ({ currency: row.currency, collected: row.paid, paidOut: row.received }))

  return { settleSimulated, view, canSee, scoped, balanceOf, totalsByCurrency }
}

export function paymentRoutes(app: Express, ctx: Ctx): void {
  const { db, signer } = ctx
  const tools = paymentTools(ctx)

  const usesProvider = (direction: string, currency: string) => ctx.checkout !== null && direction === 'collect' && currency === 'GHS'

  /** Opens (or re-opens, idempotently by reference) the votex365 checkout for a payment that has none yet. */
  async function ensureCheckout(p: Row, claims: Claims): Promise<Row> {
    if (p.provider !== 'votex365' || p.checkout_url || p.status !== 'pending' || !ctx.checkout) return p
    const checkout = await ctx.checkout.create({
      reference: p.client_id,
      amount: Number(p.amount),
      description: `AgroConnect payment ${p.id}`,
      customer: { phone: p.phone_e164, ...(claims.name && { name: claims.name }) },
      metadata: { paymentId: p.id },
    })
    const { rows } = await db.tx(SYSTEM, (q) =>
      q.query('UPDATE payments SET provider_ref = $2, checkout_url = $3, status = $4 WHERE id = $1 RETURNING *', [p.id, checkout.providerRef, checkout.checkoutUrl, checkout.status]),
    )
    return rows[0] ?? p
  }

  /** Falls back to asking votex365 directly if their webhook has not arrived. */
  async function refreshFromProvider(p: Row): Promise<Row> {
    if (p.provider !== 'votex365' || p.status !== 'pending' || !p.provider_ref || !ctx.checkout) return p
    if (ctx.now() - new Date(p.updated_at).getTime() < PROVIDER_RECHECK_MS) return p
    const status = await ctx.checkout.status(p.provider_ref).catch(() => null)
    const { rows } = await db.tx(SYSTEM, (q) => q.query('UPDATE payments SET status = coalesce($2, status) WHERE id = $1 RETURNING *', [p.id, status]))
    return rows[0] ?? p
  }

  app.post(
    '/payments',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const body = jsonBody(req)
      if (!body.clientId) throw invalid('clientId', 'clientId is required')
      if (!isUuid(body.clientId)) throw invalid('clientId', 'clientId must be a UUID')
      if (!DIRECTIONS.includes(body.direction)) throw invalid('direction', 'direction must be collect or payout')
      if (!(typeof body.amount === 'number' && body.amount > 0 && body.amount <= MAX_PAYMENT)) throw invalid('amount', `The amount must be more than 0 and at most ${MAX_PAYMENT}.`)
      if (!NETWORKS[body.currency]) throw invalid('currency', 'currency must be GHS, NGN or KES')
      if (!NETWORKS[body.currency]?.includes(body.network)) throw invalid('network', `${body.network} cannot be used with ${body.currency}`)
      if (!isE164(body.phone)) throw invalid('phone', 'Phone numbers must be in international format, like +233241234567.')

      let payment: Row
      let status = 201
      try {
        const { rows } = await db.tx(actorOf(claims), (q) =>
          q.query(
            `INSERT INTO payments (client_id, farmer_user_id, direction, amount, currency, network, phone_e164, provider, created_at, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2, $2) RETURNING *`,
            [body.clientId, claims.sub, body.direction, round(body.amount), body.currency, body.network, body.phone,
              usesProvider(body.direction, body.currency) ? 'votex365' : 'simulated', nowDate(ctx)],
          ),
        )
        payment = rows[0] as Row
      } catch (error) {
        if (pgError(error)?.constraint !== 'payments_client_id_key') throw error
        const existing = (await db.query('SELECT * FROM payments WHERE client_id = $1', [body.clientId])).rows[0] as Row
        if (existing.farmer_user_id !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        payment = existing
        status = 200
      }
      // If votex365 cannot be reached this is a 503: the row is kept, and the phone's retry opens the checkout.
      payment = await ensureCheckout(payment, claims)
      await tools.settleSimulated()
      const current = (await db.query('SELECT * FROM payments WHERE id = $1', [payment.id])).rows[0] as Row
      return [status, { id: current.id, status: current.status, checkoutUrl: tools.view(current).checkoutUrl }]
    }),
  )

  app.get(
    '/payments/me',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      await tools.settleSimulated()
      const { limit, offset } = pageParams(query)
      const { rows } = await db.query('SELECT *, count(*) OVER() AS total FROM payments WHERE farmer_user_id = $1 ORDER BY seq DESC LIMIT $2 OFFSET $3', [claims.sub, limit, offset])
      // The balance is over every payment, not just this page.
      const all = (await db.query('SELECT direction, amount, currency, status FROM payments WHERE farmer_user_id = $1', [claims.sub])).rows
      return [200, { balance: tools.balanceOf(all), items: rows.map(tools.view), total: totalOf(rows) }]
    }),
  )

  app.get(
    '/payments/:id',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, ['farmer', ...STAFF])
      await tools.settleSimulated()
      const p = (await db.query(`${PAYMENT_SELECT} WHERE p.id = $1`, [params.id])).rows[0]
      const allowed = p && (claims.role === 'farmer' ? p.farmer_user_id === claims.sub : tools.canSee(claims, p))
      if (!p || !allowed) throw new HttpError(404, 'not_found', 'Unknown payment')
      return [200, tools.view(await refreshFromProvider(p))]
    }),
  )

  app.get(
    '/farmers/:id/payments',
    route(async ({ req, params, query }) => {
      const claims = await requireAuth(signer, req, STAFF)
      if (!/^\d+$/.test(params.id ?? '')) throw notFound('farmer')
      const record = (
        await db.query('SELECT f.id, f.phone_e164, f.created_by, reg.association_id FROM farmers f JOIN users reg ON reg.id = f.created_by WHERE f.id = $1', [params.id])
      ).rows[0]
      const allowed =
        record &&
        (claims.role === 'admin' || (claims.role === 'coordinator' && record.association_id === claims.assoc) || (claims.role === 'agent' && record.created_by === claims.sub))
      if (!record || !allowed) throw new HttpError(404, 'not_found', 'Unknown farmer')
      await tools.settleSimulated()
      // No login account yet means no payments, not an error.
      const { limit, offset } = pageParams(query)
      const { rows } = await db.query(
        `SELECT p.*, count(*) OVER() AS total FROM payments p JOIN users u ON u.id = p.farmer_user_id
          WHERE u.role = 'farmer' AND u.phone_e164 = $1 ORDER BY p.seq DESC LIMIT $2 OFFSET $3`,
        [record.phone_e164, limit, offset],
      )
      const all = (
        await db.query(
          `SELECT p.direction, p.amount, p.currency, p.status FROM payments p JOIN users u ON u.id = p.farmer_user_id
            WHERE u.role = 'farmer' AND u.phone_e164 = $1`,
          [record.phone_e164],
        )
      ).rows
      return [200, { balance: tools.balanceOf(all), items: rows.map(tools.view), total: totalOf(rows) }]
    }),
  )

  app.post(
    '/loan-requests',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, ['farmer'])
      const body = jsonBody(req)
      const purpose = String(body.purpose ?? '').trim()
      if (!body.clientId) throw invalid('clientId', 'clientId is required')
      if (!isUuid(body.clientId)) throw invalid('clientId', 'clientId must be a UUID')
      if (!(typeof body.amount === 'number' && body.amount > 0 && body.amount <= MAX_LOAN)) throw invalid('amount', `The amount must be more than 0 and at most ${MAX_LOAN}.`)
      if (!CURRENCIES.includes(body.currency)) throw invalid('currency', 'currency must be GHS, NGN or KES')
      if (!purpose || purpose.length > MAX_PURPOSE_LENGTH) throw invalid('purpose', `Say what the loan is for, in ${MAX_PURPOSE_LENGTH} characters or fewer.`)

      try {
        const { rows } = await db.tx(actorOf(claims), (q) =>
          q.query(
            `INSERT INTO loan_requests (client_id, farmer_user_id, amount, currency, purpose, created_at, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $2, $2) RETURNING id, status`,
            [body.clientId, claims.sub, round(body.amount), body.currency, purpose, nowDate(ctx)],
          ),
        )
        return [201, rows[0]]
      } catch (error) {
        if (pgError(error)?.constraint !== 'loan_requests_client_id_key') throw error
        const existing = (await db.query('SELECT id, status, farmer_user_id FROM loan_requests WHERE client_id = $1', [body.clientId])).rows[0] as Row
        if (existing.farmer_user_id !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        return [200, { id: existing.id, status: existing.status }]
      }
    }),
  )

  app.get(
    '/admin/income',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, REPORTERS)
      const income = new Map<string, { farmerId: string; name: string; currency: string; received: number }>()
      for (const p of await tools.scoped(claims, dateRange(query))) {
        if (p.direction !== 'payout' || p.status !== 'successful') continue
        const key = `${p.farmer_user_id}:${p.currency}`
        const row = income.get(key) ?? { farmerId: p.farmer_user_id, name: p.record_name || p.user_name || p.user_phone, currency: p.currency, received: 0 }
        row.received = round(row.received + Number(p.amount))
        income.set(key, row)
      }
      return [200, { items: [...income.values()].sort((a, b) => b.received - a.received) }]
    }),
  )

  app.get(
    '/admin/export/payments.csv',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, REPORTERS)
      const payments = await tools.scoped(claims, dateRange(query))
      const rows = payments.map((p) => ({ ...tools.view(p), farmerName: p.record_name || p.user_name, phoneE164: p.phone_e164 }))
      await auditEvent(db, claims, 'export.payments', 'payments', `${rows.length} rows`)
      return csvResponse(
        'payments.csv',
        ['id', 'clientId', 'farmerName', 'phoneE164', 'direction', 'amount', 'currency', 'network', 'status', 'createdAt'],
        ['amount'],
        rows,
      )
    }),
  )

  /**
   * votex365 calls this when a checkout is paid or fails. The signature covers the raw body, so this route
   * reads it unparsed. Answered with 200 once handled (or deliberately ignored); 401 makes votex365 retry.
   */
  app.post(
    '/webhooks/votex365',
    express.raw({ type: () => true, limit: '1mb' }),
    route(async ({ req }) => {
      if (!ctx.checkout) throw new HttpError(404, 'not_found', 'Not found')
      const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const event = await ctx.checkout.verifyWebhook(raw, req.headers, ctx.now())
      if (event === null) throw new HttpError(401, 'invalid_signature', 'Webhook signature or timestamp is not valid')
      if (event !== 'ignored') {
        // Final states never change again (votex365: paid is immutable).
        const { rows: settled } = await db.tx(SYSTEM, (q) =>
          q.query(
            `UPDATE payments SET status = $3, provider_ref = coalesce(provider_ref, $1)
              WHERE provider = 'votex365' AND (provider_ref = $1 OR client_id::text = $2) AND status = 'pending'
              RETURNING farmer_user_id, amount, currency`,
            [event.providerRef, event.reference, event.status],
          ),
        )
        for (const p of settled) {
          void notifyUser(ctx, p.farmer_user_id, event.status === 'successful' ? 'paymentSuccessful' : 'paymentFailed', { amount: `${p.currency} ${Number(p.amount).toFixed(2)}` }, '/?tab=wallet')
        }
      }
      return [200, { received: true }]
    }),
  )
}
