// Runs the PWA's real auth client against the mock server, so a mismatch with the contract
// shows up here and not on a phone.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './server.mjs'
import { DEMO_ACCOUNTS } from './store.mjs'

let server
let api
let http

beforeAll(async () => {
  server = await createApp()
  await new Promise((resolve) => server.listen(0, resolve))
  vi.stubEnv('VITE_AUTH_URL', `http://localhost:${server.address().port}`)
  vi.stubEnv('VITE_API_URL', `http://localhost:${server.address().port}`)
  vi.resetModules()
  api = await import('../src/auth/authApi.ts')
  http = await import('../src/lib/http.ts')
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

async function rejection(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected the call to be rejected')
}

describe('PWA auth client against the mock', () => {
  it('signs a farmer up, then back in with the PIN', async () => {
    const started = await api.startFarmer('0241234567')
    expect(started).toMatchObject({ next: 'otp' })

    const signedUp = await api.verifyFarmerOtp('0241234567', started.testCode, '4821')
    expect(signedUp.user.role).toBe('farmer')

    expect(await api.startFarmer('0241234567')).toEqual({ next: 'pin' })
    expect((await api.loginFarmer('0241234567', '4821')).token).toBeTruthy()
  })

  it('exposes the error code and attempts left from a wrong PIN', async () => {
    const error = await rejection(api.loginFarmer('0241234567', '0000'))
    expect(error).toBeInstanceOf(http.RejectedError)
    expect(error).toMatchObject({ status: 401, code: 'wrong_pin', details: { attemptsLeft: 4 } })
  })

  it('reports an account that is waiting for approval', async () => {
    const { phone, password } = DEMO_ACCOUNTS.pendingAgent
    const error = await rejection(api.loginStaff(phone, password))
    expect(error).toMatchObject({ status: 403, code: 'pending_approval' })
  })

  it('signs in an approved agent and refreshes the token', async () => {
    const { loginId, password } = DEMO_ACCOUNTS.agent
    const { token, user } = await api.loginStaff(loginId, password)
    expect(user).toMatchObject({ role: 'agent', loginId })
    expect(await api.refreshToken(token)).toBeTruthy()
  })

  it('lets an admin list and approve agents through the admin client', async () => {
    const admin = await import('../src/admin/adminApi.ts')
    const { setTokenProvider } = await import('../src/auth/authedRequest.ts')
    const { token } = await api.loginStaff(DEMO_ACCOUNTS.admin.loginId, DEMO_ACCOUNTS.admin.password)
    setTokenProvider({ getToken: () => token, refresh: async () => null })

    expect((await admin.listAgents('pending')).map((agent) => agent.id)).toContain('U-pending')
    expect(await admin.applyAgentAction('U-pending', 'approve')).toMatchObject({ status: 'approved' })
    expect(await admin.listAgents('pending')).toHaveLength(0)
    expect((await admin.listAdminFarmers()).total).toBe(0)
    expect((await admin.listAudit())[0]).toMatchObject({ action: 'agent.approve' })
    setTokenProvider(null)
  })

  it('loads dashboard figures and the CSV through the admin client', async () => {
    const admin = await import('../src/admin/adminApi.ts')
    const { setTokenProvider } = await import('../src/auth/authedRequest.ts')
    const { token } = await api.loginStaff(DEMO_ACCOUNTS.admin.loginId, DEMO_ACCOUNTS.admin.password)
    setTokenProvider({ getToken: () => token, refresh: async () => null })

    const stats = await admin.fetchStats()
    expect(stats.totals).toMatchObject({ farmers: 0, agentsActive: expect.any(Number) })
    expect(Array.isArray(stats.byCrop) && Array.isArray(stats.sync)).toBe(true)

    const csv = await (await admin.fetchCsv('farmers')).text()
    expect(csv).toContain('clientId,id,name,phoneE164')
    setTokenProvider(null)
  })

  it('lets an admin add a coordinator who can then sign in, and suspend them', async () => {
    const admin = await import('../src/admin/adminApi.ts')
    const { setTokenProvider } = await import('../src/auth/authedRequest.ts')
    const adminSession = await api.loginStaff(DEMO_ACCOUNTS.admin.loginId, DEMO_ACCOUNTS.admin.password)
    setTokenProvider({ getToken: () => adminSession.token, refresh: async () => null })

    const created = await admin.createCoordinator({ name: 'Abena Owusu', phone: '024 411 1222', association: 'ngfn', password: 'long-enough-pw' })
    expect(created).toMatchObject({ role: 'coordinator', status: 'approved', phone: '+233244111222' })
    expect((await admin.listCoordinators()).map((person) => person.name)).toContain('Abena Owusu')

    const signedIn = await api.loginStaff(created.loginId, 'long-enough-pw')
    expect(signedIn.user.role).toBe('coordinator')

    expect((await admin.applyCoordinatorAction(created.id, 'suspend')).status).toBe('suspended')
    const refused = await rejection(api.refreshToken(signedIn.token))
    expect(refused).toMatchObject({ status: 403, code: 'suspended' })

    const duplicate = await rejection(admin.createCoordinator({ name: 'Someone', phone: '0244111222', association: 'ngfn', password: 'long-enough-pw' }))
    expect(duplicate).toMatchObject({ status: 409, code: 'phone_taken' })
    setTokenProvider(null)
  })

  it('rejects a phone number that is not valid before calling the server', async () => {
    const error = await rejection(api.startFarmer('12'))
    expect(error).toMatchObject({ status: 400, code: 'invalid_request' })
  })

  it('treats an unreachable server as a network error, not a refusal', async () => {
    vi.stubEnv('VITE_AUTH_URL', 'http://localhost:1')
    vi.resetModules()
    const [{ startFarmer }, { NetworkError }] = await Promise.all([import('../src/auth/authApi.ts'), import('../src/lib/http.ts')])
    expect(await rejection(startFarmer('0241234567'))).toBeInstanceOf(NetworkError)
  })
})
