import { hashSecret } from './security.mjs'

export const ASSOCIATIONS = ['ashaiman-ufa', 'ngfn']

/** Credentials for the seeded accounts. Mock only: never reuse these anywhere real. */
export const DEMO_ACCOUNTS = {
  admin: { loginId: 'ADM-001', password: 'admin-test-pass' },
  coordinator: { loginId: 'CO-001', password: 'coord-test-pass' },
  agent: { loginId: 'AG-0001', password: 'agent-test-pass' },
  pendingAgent: { phone: '+233200000099', password: 'pending-test-pass' },
  farmer: { phone: '+233200000010', pin: '1234' },
}

/**
 * Staff PINs cannot be seeded: a staff PIN exists only on the phone and is chosen the first time that person
 * signs in on it. These are the suggested ones for demos, so everyone on the team uses the same.
 */
export const SUGGESTED_PINS = { staff: '123456', farmer: '1234' }

/** The contracts only accept E.164 numbers: a + and 8 to 15 digits, with no leading 0 after the country code. */
export const isE164 = (value) => /^\+[1-9]\d{7,14}$/.test(String(value ?? ''))

function emptyStore() {
  return {
    users: new Map(),
    otps: new Map(),
    farmers: new Map(),
    heartbeats: new Map(),
    payments: new Map(),
    loanRequests: new Map(),
    feedback: new Map(),
    cropChecks: new Map(),
    listings: new Map(),
    audit: [],
    counters: { user: 0, farmer: 0, agent: 1, coordinator: 1, serverId: 1, payment: 0, loan: 0, feedback: 0, cropCheck: 0, listing: 0 },
  }
}

/** Everything worth keeping across a restart. One-time codes are left out on purpose. */
export function snapshotOf(store) {
  return {
    users: [...store.users.values()],
    farmers: [...store.farmers.values()],
    heartbeats: [...store.heartbeats],
    payments: [...store.payments.values()],
    loanRequests: [...store.loanRequests.values()],
    feedback: [...store.feedback.values()],
    cropChecks: [...store.cropChecks.values()],
    listings: [...store.listings.values()],
    audit: store.audit,
    counters: store.counters,
  }
}

function restoreInto(store, snapshot) {
  for (const user of snapshot.users ?? []) store.users.set(user.id, user)
  for (const farmer of snapshot.farmers ?? []) store.farmers.set(farmer.id, farmer)
  for (const [id, beat] of snapshot.heartbeats ?? []) store.heartbeats.set(id, beat)
  for (const payment of snapshot.payments ?? []) store.payments.set(payment.id, payment)
  for (const loan of snapshot.loanRequests ?? []) store.loanRequests.set(loan.id, loan)
  for (const entry of snapshot.feedback ?? []) store.feedback.set(entry.id, entry)
  for (const check of snapshot.cropChecks ?? []) store.cropChecks.set(check.id, check)
  for (const listing of snapshot.listings ?? []) store.listings.set(listing.id, listing)
  store.audit = snapshot.audit ?? []
  Object.assign(store.counters, snapshot.counters)
}

/** Restores a previous run if given one, then makes sure every demo account exists. */
export async function createStore(snapshot = null) {
  const store = emptyStore()
  if (snapshot) restoreInto(store, snapshot)
  await seedDemoAccounts(store)
  return store
}

/** Only adds what is missing, so a data file saved by an older version still gets the newer demo accounts. */
async function seedDemoAccounts(store) {
  const add = async (user, { password, pin }) => {
    if (store.users.has(user.id)) return
    store.users.set(user.id, {
      failedAttempts: 0,
      lockedUntil: 0,
      createdAt: Date.now(),
      ...user,
      ...(password && { passwordHash: await hashSecret(password) }),
      ...(pin && { pinHash: await hashSecret(pin) }),
    })
  }

  await add(
    { id: 'U-admin', role: 'admin', name: 'Ama Admin', phone: '+233200000001', loginId: DEMO_ACCOUNTS.admin.loginId, status: 'approved' },
    DEMO_ACCOUNTS.admin,
  )
  await add(
    { id: 'U-coord', role: 'coordinator', name: 'Kwame Coordinator', phone: '+233200000002', loginId: DEMO_ACCOUNTS.coordinator.loginId, assoc: 'ashaiman-ufa', status: 'approved' },
    DEMO_ACCOUNTS.coordinator,
  )
  await add(
    { id: 'U-agent', role: 'agent', name: 'Efua Agent', phone: '+233200000003', loginId: DEMO_ACCOUNTS.agent.loginId, assoc: 'ashaiman-ufa', status: 'approved' },
    DEMO_ACCOUNTS.agent,
  )
  await add(
    { id: 'U-pending', role: 'agent', name: 'Pending Pat', phone: DEMO_ACCOUNTS.pendingAgent.phone, loginId: null, assoc: 'ashaiman-ufa', status: 'pending' },
    DEMO_ACCOUNTS.pendingAgent,
  )
  await add(
    { id: 'U-farmer', role: 'farmer', name: 'Akosua Farmer', phone: DEMO_ACCOUNTS.farmer.phone, loginId: null, status: 'approved' },
    DEMO_ACCOUNTS.farmer,
  )
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
