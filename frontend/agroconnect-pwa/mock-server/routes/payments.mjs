import { csvResponse } from '../csv.mjs'
import { HttpError, readJson } from '../http.mjs'
import { requireAuth } from '../security.mjs'
import { addAudit, isE164 } from '../store.mjs'
import { accraDay, dateRange, inRange } from '../time.mjs'

const NETWORKS = { GHS: ['mtn', 'telecel', 'airteltigo'], KES: ['mpesa'], NGN: ['bank_transfer'] }
const DIRECTIONS = ['collect', 'payout']
const MAX_PAYMENT = 10_000
const MAX_LOAN = 50_000
const MAX_PURPOSE_LENGTH = 200
const STAFF = ['agent', 'coordinator', 'admin']
const REPORTERS = ['admin', 'coordinator']

const round = (amount) => Math.round(amount * 100) / 100

const invalid = (field, message) => new HttpError(400, 'invalid_request', message, { field })

/**
 * Stands in for payments-service in test mode. A payment stays pending for `paymentDelayMs`, then
 * succeeds, except that a phone number ending in 0000 fails, so both outcomes can be demonstrated.
 * The status is worked out when it is read, so no timers are needed and it survives a restart.
 */
export function paymentTools({ store, config }) {
  const statusOf = (payment) => {
    if (config.now() - payment.createdAtMs < config.paymentDelayMs) return 'pending'
    return payment.phone.endsWith('0000') ? 'failed' : 'successful'
  }

  const view = (payment) => ({
    id: payment.id,
    clientId: payment.clientId,
    direction: payment.direction,
    amount: payment.amount,
    currency: payment.currency,
    network: payment.network,
    phone: payment.phone,
    status: statusOf(payment),
    createdAt: payment.createdAt,
  })

  const recordFor = (user) => [...store.farmers.values()].find((farmer) => farmer.phoneE164 === user.phone)
  const userForRecord = (record) => [...store.users.values()].find((u) => u.role === 'farmer' && u.phone === record.phoneE164)
  const registrar = (record) => store.users.get(record?.registeredBy)

  /** Admins see everything, a coordinator their association's farmers, an agent only the farmers they registered. */
  function canSee(claims, farmerUser) {
    if (claims.role === 'admin') return true
    const record = recordFor(farmerUser)
    if (claims.role === 'coordinator') return registrar(record)?.assoc === claims.assoc
    return claims.role === 'agent' && record?.registeredBy === claims.sub
  }

  const all = () => [...store.payments.values()]

  function scoped(claims, range = {}) {
    return all().filter((payment) => {
      const farmerUser = store.users.get(payment.farmerId)
      return farmerUser && canSee(claims, farmerUser) && inRange(accraDay(payment.createdAt), range)
    })
  }

  /** Received is money paid out to the farmer, paid is money collected from them; only successful payments count. */
  function balanceOf(payments) {
    const rows = new Map()
    for (const payment of payments.filter((p) => statusOf(p) === 'successful')) {
      const row = rows.get(payment.currency) ?? { currency: payment.currency, received: 0, paid: 0 }
      if (payment.direction === 'payout') row.received += payment.amount
      else row.paid += payment.amount
      rows.set(payment.currency, row)
    }
    return [...rows.values()].map((row) => ({
      currency: row.currency,
      received: round(row.received),
      paid: round(row.paid),
      amount: round(row.received - row.paid),
    }))
  }

  const totalsByCurrency = (claims, range) =>
    balanceOf(scoped(claims, range)).map((row) => ({ currency: row.currency, collected: row.paid, paidOut: row.received }))

  return { statusOf, view, recordFor, userForRecord, registrar, canSee, all, scoped, balanceOf, totalsByCurrency }
}

export function paymentRoutes(ctx) {
  const { store, config } = ctx
  const tools = paymentTools(ctx)
  const newestFirst = (list) => [...list].sort((a, b) => b.createdAtMs - a.createdAtMs)

  return [
    ['POST', '/payments', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const body = await readJson(req)

      if (!body.clientId) throw invalid('clientId', 'clientId is required')
      if (!DIRECTIONS.includes(body.direction)) throw invalid('direction', 'direction must be collect or payout')
      if (!(typeof body.amount === 'number' && body.amount > 0 && body.amount <= MAX_PAYMENT)) {
        throw invalid('amount', `The amount must be more than 0 and at most ${MAX_PAYMENT}.`)
      }
      if (!NETWORKS[body.currency]) throw invalid('currency', 'currency must be GHS, NGN or KES')
      if (!NETWORKS[body.currency].includes(body.network)) throw invalid('network', `${body.network} cannot be used with ${body.currency}`)
      if (!isE164(body.phone)) throw invalid('phone', 'Phone numbers must be in international format, like +233241234567.')

      const existing = tools.all().find((payment) => payment.clientId === body.clientId)
      if (existing) {
        if (existing.farmerId !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        return [200, { id: existing.id, status: tools.statusOf(existing) }]
      }

      const payment = {
        id: `P-${++store.counters.payment}`,
        clientId: body.clientId,
        farmerId: claims.sub,
        direction: body.direction,
        amount: body.amount,
        currency: body.currency,
        network: body.network,
        phone: body.phone,
        createdAt: new Date(config.now()).toISOString(),
        createdAtMs: config.now(),
      }
      store.payments.set(payment.id, payment)
      return [201, { id: payment.id, status: 'pending' }]
    }],

    ['GET', '/payments/me', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const mine = tools.all().filter((payment) => payment.farmerId === claims.sub)
      return [200, { balance: tools.balanceOf(mine), items: newestFirst(mine).map(tools.view) }]
    }],

    ['GET', '/payments/:id', async ({ req, params }) => {
      const claims = await requireAuth(req, ['farmer', ...STAFF])
      const payment = store.payments.get(params.id)
      const farmerUser = payment && store.users.get(payment.farmerId)
      const allowed = claims.role === 'farmer' ? payment?.farmerId === claims.sub : farmerUser && tools.canSee(claims, farmerUser)
      if (!payment || !allowed) throw new HttpError(404, 'not_found', 'Unknown payment')
      return [200, tools.view(payment)]
    }],

    ['GET', '/farmers/:id/payments', async ({ req, params }) => {
      const claims = await requireAuth(req, STAFF)
      const record = store.farmers.get(params.id)
      const owner = record && tools.userForRecord(record)
      const allowed = claims.role === 'admin'
        || (claims.role === 'coordinator' && tools.registrar(record)?.assoc === claims.assoc)
        || (claims.role === 'agent' && record?.registeredBy === claims.sub)
      if (!record || !allowed) throw new HttpError(404, 'not_found', 'Unknown farmer')
      const theirs = owner ? tools.all().filter((payment) => payment.farmerId === owner.id) : []
      return [200, { balance: tools.balanceOf(theirs), items: newestFirst(theirs).map(tools.view) }]
    }],

    ['POST', '/loan-requests', async ({ req }) => {
      const claims = await requireAuth(req, ['farmer'])
      const body = await readJson(req)
      const purpose = String(body.purpose ?? '').trim()

      if (!body.clientId) throw invalid('clientId', 'clientId is required')
      if (!(typeof body.amount === 'number' && body.amount > 0 && body.amount <= MAX_LOAN)) throw invalid('amount', `The amount must be more than 0 and at most ${MAX_LOAN}.`)
      if (!NETWORKS[body.currency]) throw invalid('currency', 'currency must be GHS, NGN or KES')
      if (!purpose || purpose.length > MAX_PURPOSE_LENGTH) throw invalid('purpose', `Say what the loan is for, in ${MAX_PURPOSE_LENGTH} characters or fewer.`)

      const existing = [...store.loanRequests.values()].find((loan) => loan.clientId === body.clientId)
      if (existing) {
        if (existing.farmerId !== claims.sub) throw new HttpError(409, 'client_id_taken', 'That clientId belongs to another account')
        return [200, { id: existing.id, status: existing.status }]
      }

      const loan = {
        id: `L-${++store.counters.loan}`,
        clientId: body.clientId,
        farmerId: claims.sub,
        amount: body.amount,
        currency: body.currency,
        purpose,
        status: 'received',
        createdAt: new Date(config.now()).toISOString(),
      }
      store.loanRequests.set(loan.id, loan)
      return [201, { id: loan.id, status: loan.status }]
    }],

    ['GET', '/admin/income', async ({ req, query }) => {
      const claims = await requireAuth(req, REPORTERS)
      const income = new Map()
      for (const payment of tools.scoped(claims, dateRange(query, HttpError))) {
        if (payment.direction !== 'payout' || tools.statusOf(payment) !== 'successful') continue
        const farmerUser = store.users.get(payment.farmerId)
        const key = `${farmerUser.id}:${payment.currency}`
        const row = income.get(key) ?? {
          farmerId: farmerUser.id,
          name: tools.recordFor(farmerUser)?.name || farmerUser.name || farmerUser.phone,
          currency: payment.currency,
          received: 0,
        }
        row.received = round(row.received + payment.amount)
        income.set(key, row)
      }
      return [200, { items: [...income.values()].sort((a, b) => b.received - a.received) }]
    }],

    ['GET', '/admin/export/payments.csv', async ({ req, query }) => {
      const claims = await requireAuth(req, REPORTERS)
      const payments = newestFirst(tools.scoped(claims, dateRange(query, HttpError)))
      const rows = payments.map((payment) => {
        const farmerUser = store.users.get(payment.farmerId)
        return {
          ...tools.view(payment),
          farmerName: tools.recordFor(farmerUser)?.name || farmerUser.name,
          phoneE164: payment.phone,
        }
      })
      addAudit(ctx, claims, 'export.payments', 'payments', `${rows.length} rows`)
      return csvResponse({
        filename: 'payments.csv',
        columns: ['id', 'clientId', 'farmerName', 'phoneE164', 'direction', 'amount', 'currency', 'network', 'status', 'createdAt'],
        numericColumns: ['amount'],
        rows,
      })
    }],
  ]
}
