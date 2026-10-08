import type { Express } from 'express'
import { actorOf, ASSOCIATIONS, auditEvent, nowIso, publicUser, type Ctx, type UserRow } from '../context.js'
import { iso, num, pgError, type Row } from '../db.js'
import { HttpError, invalid, jsonBody, notFound, route } from '../http.js'
import { hashSecret, isE164, requireAuth, type Claims } from '../security.js'
import { orderBy, pageParams, totalOf } from '../pagination.js'
import { accraDay, csvResponse, dateRange, inRange, type DayRange } from '../time.js'
import { farmerView, getFarmer } from './farmers.js'
import { paymentTools } from './payments.js'

const AGENT_STATUSES = ['pending_verification', 'pending', 'approved', 'rejected', 'suspended']
const REPORTERS = ['admin', 'coordinator'] as const
const ACRES_TO_HECTARES = 0.404686

const inScope = (claims: Claims, assoc: string | null | undefined) => claims.role === 'admin' || assoc === claims.assoc

function tally<T>(items: T[], keysOf: (item: T) => string | string[]) {
  const counts = new Map<string, number>()
  for (const item of items) for (const key of ([] as string[]).concat(keysOf(item))) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts].map(([key, count]) => ({ key, count }))
}

const byCountDescending = (rows: { key: string; count: number }[]) => rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

const CSV_COLUMNS = [
  'clientId', 'id', 'name', 'phoneE164', 'gender', 'preferredLanguage', 'community', 'region',
  'farmSizeHectares', 'farmSizeEntered', 'farmSizeUnit', 'crops', 'lat', 'lng', 'accuracyMetres',
  'registeredAt', 'createdAt', 'registeredBy',
]
const NUMERIC_COLUMNS = ['farmSizeHectares', 'farmSizeEntered', 'lat', 'lng', 'accuracyMetres']

export function adminRoutes(app: Express, ctx: Ctx): void {
  const { db, signer } = ctx
  const payments = paymentTools(ctx)

  /** Farmers with their crops and the registering agent, limited to what the caller may see. */
  async function scopedFarmers(claims: Claims, range: DayRange = { from: null, to: null }) {
    const { rows } = await db.query(
      `SELECT f.*, agent.name AS agent_name, agent.login_id AS agent_login_id, agent.association_id AS agent_assoc,
              coalesce(array_agg(c.crop_type ORDER BY c.crop_type) FILTER (WHERE c.crop_type IS NOT NULL), '{}') AS crops
         FROM farmers f
         JOIN users agent ON agent.id = f.created_by
         LEFT JOIN farmer_crops c ON c.farmer_id = f.id
        WHERE $1 = 'admin' OR agent.association_id = $2
        GROUP BY f.id, agent.id
        ORDER BY f.id DESC`,
      [claims.role, claims.assoc ?? null],
    )
    return rows.filter((row) => inRange(accraDay(row.registered_at), range))
  }

  async function scopedAgents(claims: Claims) {
    const { rows } = await db.query<UserRow & { pending: number | null; attention: number | null; last_sync_at: Date | null; beat_at: Date | null }>(
      `SELECT u.*, s.pending, s.attention, s.last_sync_at, s.updated_at AS beat_at
         FROM users u LEFT JOIN agent_sync_status s ON s.agent_id = u.id
        WHERE u.role = 'agent' AND u.status = 'approved' AND ($1 = 'admin' OR u.association_id = $2)
        ORDER BY u.id`,
      [claims.role, claims.assoc ?? null],
    )
    return rows
  }

  /** One admin action on a staff account. The audit trigger records it as agent.approve and so on. */
  function transition(role: 'agent' | 'coordinator', action: string, from: string[], to: string, assignsId = false) {
    const collection = role === 'agent' ? 'agents' : 'coordinators'
    app.post(
      `/admin/${collection}/:id/${action}`,
      route(async ({ req, params }) => {
        const claims = await requireAuth(signer, req, ['admin'])
        const { reason = '' } = jsonBody(req)
        const outcome = await db.tx(actorOf(claims), async (q) => {
          const account = (await q.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [params.id])).rows[0]
          if (!account || account.role !== role || !inScope(claims, account.association_id)) return new HttpError(404, 'not_found', `Unknown ${role}`)
          if (!from.includes(account.status)) return new HttpError(409, 'invalid_transition', `Cannot ${action} an account that is ${account.status}.`)
          const loginId =
            assignsId && !account.login_id
              ? `AG-${String((await q.query("SELECT nextval('agent_login_seq') AS n")).rows[0]?.n).padStart(4, '0')}`
              : account.login_id
          const { rows } = await q.query<UserRow>(
            'UPDATE users SET status = $2, status_reason = $3, login_id = $4 WHERE id = $1 RETURNING *',
            [account.id, to, String(reason) || null, loginId],
          )
          return rows[0] as UserRow
        })
        if (outcome instanceof HttpError) throw outcome
        return [200, publicUser(outcome)]
      }),
    )
  }

  app.get(
    '/admin/agents',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, REPORTERS)
      const status = query.get('status')
      if (status && !AGENT_STATUSES.includes(status)) throw invalid('status', 'Unknown status')
      const { limit, offset } = pageParams(query)
      const order = orderBy(query, { createdAt: 'u.created_at', name: 'u.name', status: 'u.status' }, 'u.created_at', 'asc')
      const { rows } = await db.query<UserRow>(
        `SELECT u.*, count(*) OVER() AS total FROM users u
          WHERE u.role = 'agent' AND ($1 = 'admin' OR u.association_id = $2) AND ($3::text IS NULL OR u.status = $3)
          ORDER BY ${order}, u.id LIMIT $4 OFFSET $5`,
        [claims.role, claims.assoc ?? null, status, limit, offset],
      )
      return [200, { items: rows.map(publicUser), total: totalOf(rows) }]
    }),
  )

  transition('agent', 'approve', ['pending'], 'approved', true)
  transition('agent', 'reject', ['pending'], 'rejected')
  transition('agent', 'suspend', ['approved'], 'suspended')
  transition('agent', 'reinstate', ['suspended'], 'approved')

  app.get(
    '/admin/coordinators',
    route(async ({ req, query }) => {
      await requireAuth(signer, req, ['admin'])
      const { limit, offset } = pageParams(query)
      const order = orderBy(query, { createdAt: 'created_at', name: 'name' }, 'created_at', 'asc')
      const { rows } = await db.query<UserRow>(`SELECT *, count(*) OVER() AS total FROM users WHERE role = 'coordinator' ORDER BY ${order}, id LIMIT $1 OFFSET $2`, [limit, offset])
      return [200, { items: rows.map(publicUser), total: totalOf(rows) }]
    }),
  )

  transition('coordinator', 'suspend', ['approved'], 'suspended')
  transition('coordinator', 'reinstate', ['suspended'], 'approved')

  app.post(
    '/admin/coordinators',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, ['admin'])
      const body = jsonBody(req)
      const name = String(body.name ?? '').trim()
      if (name.length < 2) throw invalid('name', 'Enter their name.')
      if (!isE164(body.phone)) throw invalid('phone', 'Phone numbers must be in international format, like +233241234567.')
      if (!ASSOCIATIONS.includes(body.association)) throw invalid('association', 'Choose an association.')
      if (String(body.password ?? '').length < 8) throw invalid('password', 'The password needs at least 8 characters.')
      const passwordHash = await hashSecret(String(body.password))
      try {
        const user = await db.tx(actorOf(claims), async (q) => {
          const { rows } = await q.query<UserRow>(
            `INSERT INTO users (role, name, phone_e164, login_id, association_id, status, password_hash, created_by, updated_by)
             VALUES ('coordinator', $1, $2, 'CO-' || lpad(nextval('coordinator_login_seq')::text, 4, '0'), $3, 'approved', $4, $5, $5)
             RETURNING *`,
            [name, body.phone, body.association, passwordHash, claims.sub],
          )
          return rows[0] as UserRow
        })
        return [201, publicUser(user)]
      } catch (error) {
        if (pgError(error)?.constraint === 'users_staff_phone_key') throw new HttpError(409, 'phone_taken', 'An account with this phone number already exists.')
        throw error
      }
    }),
  )

  /** ADMIN-CONTRACT: ?query=&community=&crop=&page=1 → { items, total }. Paged in SQL, not in memory. */
  app.get(
    '/admin/farmers',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, REPORTERS)
      const text = (query.get('query') ?? '').trim()
      const community = (query.get('community') ?? '').trim().toLowerCase()
      const crop = query.get('crop') ?? ''
      const { limit, offset } = pageParams(query)
      const order = orderBy(query, { name: 'f.name', community: 'f.community', registeredAt: 'f.registered_at' }, 'f.id')
      const { rows } = await db.query(
        `SELECT f.id, f.name, f.phone_e164, f.community, f.region, agent.name AS agent_name, count(*) OVER() AS total
           FROM farmers f JOIN users agent ON agent.id = f.created_by
          WHERE ($1 = 'admin' OR agent.association_id = $2)
            AND ($3 = '' OR f.name ILIKE '%' || $3 || '%' OR f.phone_e164 ILIKE '%' || $3 || '%')
            AND ($4 = '' OR lower(coalesce(f.community, '')) = $4)
            AND ($5 = '' OR EXISTS (SELECT 1 FROM farmer_crops c WHERE c.farmer_id = f.id AND c.crop_type = $5))
          ORDER BY ${order}, f.id DESC LIMIT $6 OFFSET $7`,
        [claims.role, claims.assoc ?? null, text, community, crop, limit, offset],
      )
      const items = rows.map((row: Row) => ({
        id: String(row.id),
        name: row.name,
        phone: row.phone_e164,
        community: row.community,
        region: row.region,
        registeredByName: row.agent_name,
      }))
      return [200, { items, total: totalOf(rows) }]
    }),
  )

  /** ADMIN-CONTRACT: one farmer's full record plus their payments, scoped like the list. */
  app.get(
    '/admin/farmers/:id',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, REPORTERS)
      if (!/^\d+$/.test(params.id ?? '')) throw notFound('farmer')
      const row = await getFarmer(db, 'f.id = $1', [params.id ?? ''])
      if (!row) throw notFound('farmer')
      const registrar = (await db.query('SELECT association_id FROM users WHERE id = $1', [row.created_by])).rows[0]
      if (!inScope(claims, registrar?.association_id ?? null)) throw notFound('farmer')

      await payments.settleSimulated()
      // No login account yet means no payments, not an error.
      const { rows } = await db.query(
        `SELECT p.* FROM payments p JOIN users u ON u.id = p.farmer_user_id WHERE u.role = 'farmer' AND u.phone_e164 = $1 ORDER BY p.seq DESC`,
        [row.phone_e164],
      )
      return [200, { ...farmerView(row), balance: payments.balanceOf(rows), payments: rows.map(payments.view) }]
    }),
  )

  app.get(
    '/admin/audit',
    route(async ({ req, query }) => {
      await requireAuth(signer, req, ['admin'])
      const { limit, offset } = pageParams(query)
      const { rows } = await db.query(
        `SELECT a.changed_at, coalesce(u.login_id, a.app_actor) AS actor_id, a.actor_role, a.event, a.record_id, a.detail, count(*) OVER() AS total
           FROM audit_log a LEFT JOIN users u ON u.id = a.app_actor
          ORDER BY a.id DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      )
      const items = rows.map((row) => ({
        at: iso(row.changed_at),
        actorId: row.actor_id,
        actorRole: row.actor_role,
        action: row.event,
        targetId: row.record_id,
        detail: row.detail,
      }))
      return [200, { items, total: totalOf(rows) }]
    }),
  )

  app.get(
    '/admin/stats',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, REPORTERS)
      const range = dateRange(query)
      const farmers = await scopedFarmers(claims, range)
      const agents = await scopedAgents(claims)
      const today = accraDay(nowIso(ctx))
      const dayOf = (row: Row) => accraDay(row.registered_at)

      return [
        200,
        {
          asOf: nowIso(ctx),
          totals: { farmers: farmers.length, agentsActive: agents.length, farmersToday: farmers.filter((f) => dayOf(f) === today).length },
          byDay: tally(farmers, dayOf).sort((a, b) => a.key.localeCompare(b.key)),
          byCommunity: byCountDescending(tally(farmers, (f) => f.community || 'unknown')),
          byCrop: byCountDescending(tally(farmers, (f) => f.crops as string[])),
          byLanguage: byCountDescending(tally(farmers, (f) => f.language ?? 'unknown')),
          byGender: byCountDescending(tally(farmers, (f) => f.gender ?? 'unknown')),
          byAgent: agents
            .map((agent) => ({
              agentId: agent.login_id,
              name: agent.name,
              count: farmers.filter((f) => f.created_by === agent.id).length,
              lastSeenAt: iso(agent.beat_at),
            }))
            .sort((a, b) => b.count - a.count),
          sync: agents
            .filter((agent) => agent.beat_at)
            .map((agent) => ({ agentId: agent.login_id, pending: agent.pending, attention: agent.attention, lastSyncAt: iso(agent.last_sync_at) })),
          payments: await payments.totalsByCurrency(claims, range),
        },
      ]
    }),
  )

  app.post(
    '/agents/me/heartbeat',
    route(async ({ req }) => {
      const claims = await requireAuth(signer, req, ['agent', 'coordinator'])
      const { pending, attention, lastSyncAt, appVersion } = jsonBody(req)
      if (![pending, attention].every((n) => Number.isInteger(n) && n >= 0)) throw new HttpError(400, 'invalid_request', 'pending and attention must be whole numbers')
      await db.query(
        `INSERT INTO agent_sync_status (agent_id, pending, attention, last_sync_at, app_version, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (agent_id) DO UPDATE SET pending = $2, attention = $3, last_sync_at = $4, app_version = $5, updated_at = $6`,
        [claims.sub, pending, attention, lastSyncAt ?? null, appVersion == null ? null : String(appVersion), nowIso(ctx)],
      )
      return [204]
    }),
  )

  app.get(
    '/admin/export/farmers.csv',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, REPORTERS)
      const farmers = await scopedFarmers(claims, dateRange(query))
      const rows = farmers.map((f) => ({
        clientId: f.client_id,
        id: String(f.id),
        name: f.name,
        phoneE164: f.phone_e164,
        gender: f.gender,
        preferredLanguage: f.language,
        community: f.community,
        region: f.region,
        farmSizeHectares: f.farm_size_entered === null ? '' : Number((Number(f.farm_size_entered) * ACRES_TO_HECTARES).toFixed(4)),
        farmSizeEntered: num(f.farm_size_entered) ?? '',
        farmSizeUnit: f.farm_size_unit ?? '',
        crops: (f.crops as string[]).join(';'),
        lat: num(f.gps_lat),
        lng: num(f.gps_lng),
        accuracyMetres: num(f.gps_accuracy_m),
        registeredAt: iso(f.registered_at),
        createdAt: iso(f.created_at),
        registeredBy: f.agent_login_id,
      }))
      await auditEvent(db, claims, 'export.farmers', 'farmers', `${rows.length} rows`)
      return csvResponse('farmers.csv', CSV_COLUMNS, NUMERIC_COLUMNS, rows)
    }),
  )
}
