import { HttpError, readJson } from '../http.mjs'
import { hashSecret, requireAuth } from '../security.mjs'
import { ASSOCIATIONS, addAudit, normalisePhone, publicUser } from '../store.mjs'

const AGENT_STATUSES = ['pending_verification', 'pending', 'approved', 'rejected', 'suspended']
const pad = (n) => String(n).padStart(4, '0')

export function adminRoutes(ctx) {
  const { store } = ctx

  function findAgent(id, claims) {
    const user = store.users.get(id)
    const outOfScope = claims.role === 'coordinator' && user?.assoc !== claims.assoc
    if (!user || user.role !== 'agent' || outOfScope) throw new HttpError(404, 'not_found', 'Unknown agent')
    return user
  }

  /** `from` -> `to` transitions an admin may apply to an agent account. */
  function transition(action, from, to, { assignsId = false } = {}) {
    return ['POST', `/admin/agents/:id/${action}`, async ({ req, params }) => {
      const claims = await requireAuth(req, ['admin'])
      const agent = findAgent(params.id, claims)
      if (!from.includes(agent.status)) throw new HttpError(409, 'invalid_transition', `Cannot ${action} an account that is ${agent.status}.`)
      const { reason = '' } = await readJson(req)
      agent.status = to
      if (assignsId && !agent.loginId) agent.loginId = `AG-${pad(++store.counters.agent)}`
      addAudit(ctx, claims, `agent.${action}`, agent.id, reason)
      return [200, publicUser(agent)]
    }]
  }

  return [
    ['GET', '/admin/agents', async ({ req, query }) => {
      const claims = await requireAuth(req, ['admin', 'coordinator'])
      const status = query.get('status')
      if (status && !AGENT_STATUSES.includes(status)) throw new HttpError(400, 'invalid_request', 'Unknown status', { field: 'status' })
      const items = [...store.users.values()]
        .filter((u) => u.role === 'agent')
        .filter((u) => claims.role === 'admin' || u.assoc === claims.assoc)
        .filter((u) => !status || u.status === status)
        .map(publicUser)
      return [200, { items }]
    }],

    transition('approve', ['pending'], 'approved', { assignsId: true }),
    transition('reject', ['pending'], 'rejected'),
    transition('suspend', ['approved'], 'suspended'),
    transition('reinstate', ['suspended'], 'approved'),

    ['POST', '/admin/coordinators', async ({ req }) => {
      const claims = await requireAuth(req, ['admin'])
      const body = await readJson(req)
      const phone = normalisePhone(body.phone)
      if (!phone || !ASSOCIATIONS.includes(body.association) || String(body.password ?? '').length < 8 || !body.name) {
        throw new HttpError(400, 'invalid_request', 'name, phone, association and a password of 8+ characters are required')
      }
      const user = {
        id: `U-${++store.counters.user}`,
        role: 'coordinator',
        name: body.name,
        phone,
        loginId: `CO-${pad(++store.counters.coordinator)}`,
        assoc: body.association,
        status: 'approved',
        passwordHash: await hashSecret(body.password),
        failedAttempts: 0,
        lockedUntil: 0,
        createdAt: Date.now(),
      }
      store.users.set(user.id, user)
      addAudit(ctx, claims, 'coordinator.create', user.id)
      return [201, publicUser(user)]
    }],

    ['GET', '/admin/farmers', async ({ req }) => {
      const claims = await requireAuth(req, ['admin', 'coordinator'])
      const items = [...store.farmers.values()]
        .map((farmer) => ({ farmer, agent: store.users.get(farmer.registeredBy) }))
        .filter(({ agent }) => claims.role === 'admin' || agent?.assoc === claims.assoc)
        .map(({ farmer, agent }) => ({
          id: farmer.id,
          name: farmer.name,
          phone: farmer.phone,
          community: farmer.community,
          region: farmer.region,
          registeredByName: agent?.name,
        }))
      return [200, { items, total: items.length }]
    }],

    ['GET', '/admin/audit', async ({ req }) => {
      await requireAuth(req, ['admin'])
      return [200, { items: store.audit }]
    }],
  ]
}
