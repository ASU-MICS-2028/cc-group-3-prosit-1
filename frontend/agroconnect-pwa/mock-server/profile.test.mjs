// Contract tests for the optional farmer profile (API-CONTRACT "profile"). Ported to backend/test.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './server.mjs'
import { DEMO_ACCOUNTS } from './store.mjs'

const servers = []
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))))

async function boot() {
  const server = await createApp()
  await new Promise((resolve) => server.listen(0, resolve))
  servers.push(server)
  const base = `http://localhost:${server.address().port}`
  const call = async (method, path, { token, body } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, body: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text }
  }
  const staff = async (account) => (await call('POST', '/auth/staff/login', { body: { identifier: account.loginId, password: account.password } })).body.token
  return { call, agent: () => staff(DEMO_ACCOUNTS.agent), admin: () => staff(DEMO_ACCOUNTS.admin) }
}

const FULL_PROFILE = {
  soilType: 'loamy',
  seasons: ['major', 'minor'],
  phoneType: 'feature',
  dataPlan: 'daily',
  contactChannel: 'sms',
  incomeSources: ['crops', 'trading'],
  hasBankAccount: false,
  mobileMoney: 'regular',
  needs: ['credit', 'market'],
  extensionVisit: 'over_a_year',
}

const EMPTY_PROFILE = {
  soilType: null, seasons: [], phoneType: null, dataPlan: null, contactChannel: null,
  incomeSources: [], hasBankAccount: null, mobileMoney: null, needs: [], extensionVisit: null,
}

const farmer = (overrides = {}) => ({ clientId: 'pf-1', name: 'Abena Profile', countryCode: '+233', phoneNational: '245550001', ...overrides })

describe('farmer profile', () => {
  it('stores the full profile and returns it on the record', async () => {
    const t = await boot()
    const { body } = await t.call('POST', '/farmers', { token: await t.agent(), body: farmer({ profile: FULL_PROFILE }) })
    const record = await t.call('GET', `/farmers/${body.id}`, { token: await t.admin() })
    expect(record.body.profile).toEqual(FULL_PROFILE)
  })

  it('is optional: a record without one has an empty profile', async () => {
    const t = await boot()
    const { body } = await t.call('POST', '/farmers', { token: await t.agent(), body: farmer() })
    const record = await t.call('GET', `/farmers/${body.id}`, { token: await t.admin() })
    expect(record.body.profile).toEqual(EMPTY_PROFILE)
  })

  it('refuses values outside the lists, naming the field', async () => {
    const t = await boot()
    const token = await t.agent()
    const post = (profile, n) => t.call('POST', '/farmers', { token, body: farmer({ clientId: `pf-bad-${n}`, phoneNational: `24555010${n}`, profile }) })
    expect((await post({ soilType: 'rocky' }, 1)).body).toMatchObject({ error: 'invalid_request', field: 'profile.soilType' })
    expect((await post({ needs: ['credit', 'jets'] }, 2)).body).toMatchObject({ field: 'profile.needs' })
    expect((await post({ hasBankAccount: 'yes' }, 3)).body).toMatchObject({ field: 'profile.hasBankAccount' })
    expect((await post('nope', 4)).body).toMatchObject({ field: 'profile' })
  })

  it('feeds the dashboard breakdowns and the CSV', async () => {
    const t = await boot()
    const agent = await t.agent()
    await t.call('POST', '/farmers', { token: agent, body: farmer({ profile: FULL_PROFILE }) })
    await t.call('POST', '/farmers', { token: agent, body: farmer({ clientId: 'pf-2', phoneNational: '245550002', profile: { phoneType: 'smartphone', needs: ['credit'] } }) })
    const admin = await t.admin()
    const { body: stats } = await t.call('GET', '/admin/stats', { token: admin })
    expect(stats.byPhoneType).toEqual([{ key: 'feature', count: 1 }, { key: 'smartphone', count: 1 }])
    expect(stats.byNeed).toEqual([{ key: 'credit', count: 2 }, { key: 'market', count: 1 }])
    expect(stats.byMobileMoney).toEqual([{ key: 'regular', count: 1 }, { key: 'unknown', count: 1 }])
    expect(stats.bankAccount).toEqual(expect.arrayContaining([{ key: 'no', count: 1 }, { key: 'unknown', count: 1 }]))
    const csv = await t.call('GET', '/admin/export/farmers.csv', { token: admin })
    expect(csv.body).toContain('soilType,seasons,phoneType,dataPlan,contactChannel,incomeSources,hasBankAccount,mobileMoney,needs,extensionVisit')
    expect(csv.body).toContain('loamy,major;minor,feature,daily,sms,crops;trading,no,regular,credit;market,over_a_year')
  })
})
