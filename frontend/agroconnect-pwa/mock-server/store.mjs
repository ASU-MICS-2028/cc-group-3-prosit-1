import { hashSecret } from './security.mjs'

export const ASSOCIATIONS = ['ashaiman-ufa', 'ngfn']

/** Credentials for the seeded accounts. Mock only: never reuse these anywhere real. */
export const DEMO_ACCOUNTS = {
  admin: { loginId: 'ADM-001', password: 'admin-test-pass' },
  coordinator: { loginId: 'CO-001', password: 'coord-test-pass' },
  agent: { loginId: 'AG-0001', password: 'agent-test-pass' },
  pendingAgent: { phone: '+233200000099', password: 'pending-test-pass' },
}

/** 0241234567, 233241234567 and +233 24 123 4567 all become +233241234567. */
export function normalisePhone(raw) {
  const match = /^(?:\+233|233|0)(\d{9})$/.exec(String(raw ?? '').replace(/[\s\-().]/g, ''))
  return match ? `+233${match[1]}` : null
}

export async function createStore() {
  const store = {
    users: new Map(),
    otps: new Map(),
    farmers: new Map(),
    audit: [],
    counters: { user: 0, farmer: 0, agent: 1, coordinator: 1, serverId: 1 },
  }

  const seed = async (user, password) => {
    store.users.set(user.id, { failedAttempts: 0, lockedUntil: 0, createdAt: Date.now(), ...user, passwordHash: await hashSecret(password) })
  }

  await seed(
    { id: 'U-admin', role: 'admin', name: 'Ama Admin', phone: '+233200000001', loginId: DEMO_ACCOUNTS.admin.loginId, status: 'approved' },
    DEMO_ACCOUNTS.admin.password,
  )
  await seed(
    { id: 'U-coord', role: 'coordinator', name: 'Kwame Coordinator', phone: '+233200000002', loginId: DEMO_ACCOUNTS.coordinator.loginId, assoc: 'ashaiman-ufa', status: 'approved' },
    DEMO_ACCOUNTS.coordinator.password,
  )
  await seed(
    { id: 'U-agent', role: 'agent', name: 'Efua Agent', phone: '+233200000003', loginId: DEMO_ACCOUNTS.agent.loginId, assoc: 'ashaiman-ufa', status: 'approved' },
    DEMO_ACCOUNTS.agent.password,
  )
  await seed(
    { id: 'U-pending', role: 'agent', name: 'Pending Pat', phone: DEMO_ACCOUNTS.pendingAgent.phone, loginId: null, assoc: 'ashaiman-ufa', status: 'pending' },
    DEMO_ACCOUNTS.pendingAgent.password,
  )
  return store
}

export const publicUser = (user) => ({
  id: user.id,
  role: user.role,
  name: user.name,
  phone: user.phone,
  assoc: user.assoc,
  loginId: user.loginId,
  status: user.status,
})

export function addAudit({ store, config }, actor, action, targetId, detail = '') {
  store.audit.unshift({ at: new Date(config.now()).toISOString(), actorId: actor.sub, actorRole: actor.role, action, targetId, detail })
}
