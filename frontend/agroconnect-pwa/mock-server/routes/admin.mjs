import { HttpError, readJson } from '../http.mjs'
import { hashSecret, requireAuth } from '../security.mjs'
import { ASSOCIATIONS, addAudit, isE164, publicUser } from '../store.mjs'

const AGENT_STATUSES = ['pending_verification', 'pending', 'approved', 'rejected', 'suspended']
const pad = (n) => String(n).padStart(4, '0')

export function adminRoutes(ctx) {
  const { store } = ctx

  function findStaff(id, claims, role) {
    const user = store.users.get(id)
    const outOfScope = claims.role === 'coordinator' && user?.assoc !== claims.assoc
    if (!user || user.role !== role || outOfScope) throw new HttpError(404, 'not_found', `Unknown ${role}`)
    return user
  }

  /**
   * One admin action on a staff account: `from` -> `to`. Agents and coordinators share the rules,
   * under /admin/agents and /admin/coordinators, and each is recorded in the audit log.
   */
  function transition(role, action, from, to, { assignsId = false } = {}) {
    const collection = role === 'agent' ? 'agents' : 'coordinators'
    return ['POST', `/admin/${collection}/:id/${action}`, async ({ req, params }) => {
      const claims = await requireAuth(req, ['admin'])
      const account = findStaff(params.id, claims, role)
      if (!from.includes(account.status)) throw new HttpError(409, 'invalid_transition', `Cannot ${action} an account that is ${account.status}.`)
      const { reason = '' } = await readJson(req)
      account.status = to
      if (assignsId && !account.loginId) account.loginId = `AG-${pad(++store.counters.agent)}`
      addAudit(ctx, claims, `${role}.${action}`, account.id, reason)
      return [200, publicUser(account)]
    }]
  }

  const staffWithPhone = (phone) => [...store.users.values()].some((u) => u.role !== 'farmer' && u.phone === phone)

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

    transition('agent', 'approve', ['pending'], 'approved', { assignsId: true }),
    transition('agent', 'reject', ['pending'], 'rejected'),
    transition('agent', 'suspend', ['approved'], 'suspended'),
    transition('agent', 'reinstate', ['suspended'], 'approved'),

    ['GET', '/admin/coordinators', async ({ req }) => {
      await requireAuth(req, ['admin'])
      return [200, { items: [...store.users.values()].filter((u) => u.role === 'coordinator').map(publicUser) }]
    }],

    transition('coordinator', 'suspend', ['approved'], 'suspended'),
    transition('coordinator', 'reinstate', ['suspended'], 'approved'),

    ['POST', '/admin/coordinators', async ({ req }) => {
      const claims = await requireAuth(req, ['admin'])
      const body = await readJson(req)
      const invalid = (field, message) => new HttpError(400, 'invalid_request', message, { field })

      if (String(body.name ?? '').trim().length < 2) throw invalid('name', 'Enter their name.')
      if (!isE164(body.phone)) throw invalid('phone', 'Phone numbers must be in international format, like +233241234567.')
      if (!ASSOCIATIONS.includes(body.association)) throw invalid('association', 'Choose an association.')
      if (String(body.password ?? '').length < 8) throw invalid('password', 'The password needs at least 8 characters.')
      if (staffWithPhone(body.phone)) throw new HttpError(409, 'phone_taken', 'An account with this phone number already exists.')

      const user = {
        id: `U-${++store.counters.user}`,
        role: 'coordinator',
        name: body.name.trim(),
        phone: body.phone,
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
          phone: farmer.phoneE164,
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
