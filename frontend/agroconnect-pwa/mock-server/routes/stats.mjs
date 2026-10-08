import { csvResponse } from '../csv.mjs'
import { PROFILE_BREAKDOWNS, PROFILE_FIELDS, normaliseProfile, profileCell } from '../profile.mjs'
import { HttpError, readJson } from '../http.mjs'
import { requireAuth } from '../security.mjs'
import { addAudit } from '../store.mjs'
import { accraDay, dateRange, inRange } from '../time.mjs'
import { paymentTools } from './payments.mjs'

const REPORTERS = ['admin', 'coordinator']
const ACRES_TO_HECTARES = 0.404686

function tally(items, keysOf) {
  const counts = new Map()
  for (const item of items) for (const key of [].concat(keysOf(item))) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts].map(([key, count]) => ({ key, count }))
}

const byCountDescending = (rows) => rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

const CSV_COLUMNS = [
  'clientId', 'id', 'name', 'phoneE164', 'gender', 'preferredLanguage', 'community', 'region',
  'farmSizeHectares', 'farmSizeEntered', 'farmSizeUnit', 'crops', 'lat', 'lng', 'accuracyMetres',
  'registeredAt', 'createdAt', 'registeredBy',
  ...Object.keys(PROFILE_FIELDS),
]
const NUMERIC_COLUMNS = ['farmSizeHectares', 'farmSizeEntered', 'lat', 'lng', 'accuracyMetres']

export function statsRoutes(ctx) {
  const { store, config } = ctx
  const payments = paymentTools(ctx)

  const inScope = (claims, agent) => claims.role === 'admin' || agent?.assoc === claims.assoc

  function scopedFarmers(claims, { from, to } = {}) {
    return [...store.farmers.values()].filter((farmer) => {
      if (!inScope(claims, store.users.get(farmer.registeredBy))) return false
      return inRange(accraDay(farmer.registeredAt ?? farmer.createdAt), { from, to })
    })
  }

  const scopedAgents = (claims) => [...store.users.values()].filter((u) => u.role === 'agent' && u.status === 'approved' && inScope(claims, u))

  return [
    ['GET', '/admin/stats', async ({ req, query }) => {
      const claims = await requireAuth(req, REPORTERS)
      const farmers = scopedFarmers(claims, dateRange(query, HttpError))
      const agents = scopedAgents(claims)
      const today = accraDay(new Date(config.now()).toISOString())

      return [200, {
        asOf: new Date(config.now()).toISOString(),
        totals: {
          farmers: farmers.length,
          agentsActive: agents.length,
          farmersToday: farmers.filter((f) => accraDay(f.registeredAt ?? f.createdAt) === today).length,
        },
        byDay: tally(farmers, (f) => accraDay(f.registeredAt ?? f.createdAt)).sort((a, b) => a.key.localeCompare(b.key)),
        byCommunity: byCountDescending(tally(farmers, (f) => f.community || 'unknown')),
        byCrop: byCountDescending(tally(farmers, (f) => f.crops ?? [])),
        byLanguage: byCountDescending(tally(farmers, (f) => f.preferredLanguage ?? 'unknown')),
        byGender: byCountDescending(tally(farmers, (f) => f.gender ?? 'unknown')),
        ...Object.fromEntries(Object.entries(PROFILE_BREAKDOWNS).map(([key, field]) => [
          key,
          byCountDescending(tally(farmers, (f) => {
            const value = normaliseProfile(f.profile)[field]
            return Array.isArray(value) ? value : String(value ?? 'unknown')
          })),
        ])),
        bankAccount: tally(farmers, (f) => { const v = normaliseProfile(f.profile).hasBankAccount; return v === null ? 'unknown' : v ? 'yes' : 'no' }),
        byAgent: agents.map((agent) => ({
          agentId: agent.loginId,
          name: agent.name,
          count: farmers.filter((f) => f.registeredBy === agent.id).length,
          lastSeenAt: store.heartbeats.get(agent.id)?.updatedAt ?? null,
        })).sort((a, b) => b.count - a.count),
        sync: agents.flatMap((agent) => {
          const beat = store.heartbeats.get(agent.id)
          return beat ? [{ agentId: agent.loginId, pending: beat.pending, attention: beat.attention, lastSyncAt: beat.lastSyncAt }] : []
        }),
        payments: payments.totalsByCurrency(claims, dateRange(query, HttpError)),
      }]
    }],

    ['POST', '/agents/me/heartbeat', async ({ req }) => {
      const claims = await requireAuth(req, ['agent', 'coordinator'])
      const { pending, attention, lastSyncAt, appVersion } = await readJson(req)
      if (![pending, attention].every((n) => Number.isInteger(n) && n >= 0)) {
        throw new HttpError(400, 'invalid_request', 'pending and attention must be whole numbers')
      }
      store.heartbeats.set(claims.sub, { pending, attention, lastSyncAt: lastSyncAt ?? null, appVersion, updatedAt: new Date(config.now()).toISOString() })
      return [204, undefined]
    }],

    ['GET', '/admin/export/farmers.csv', async ({ req, query }) => {
      const claims = await requireAuth(req, REPORTERS)
      const farmers = scopedFarmers(claims, dateRange(query, HttpError))

      const rows = farmers.map((f) => {
        const acres = Number.isFinite(f.farmSizeAcres) ? f.farmSizeAcres : null
        return {
          clientId: f.clientId, id: f.id, name: f.name, phoneE164: f.phoneE164, gender: f.gender,
          preferredLanguage: f.preferredLanguage, community: f.community, region: f.region,
          farmSizeHectares: acres === null ? '' : Number((acres * ACRES_TO_HECTARES).toFixed(4)),
          farmSizeEntered: acres ?? '', farmSizeUnit: acres === null ? '' : 'acres',
          crops: (f.crops ?? []).join(';'), lat: f.gps?.lat, lng: f.gps?.lng, accuracyMetres: f.gps?.accuracy,
          registeredAt: f.registeredAt, createdAt: f.createdAt, registeredBy: store.users.get(f.registeredBy)?.loginId,
          ...Object.fromEntries(Object.entries(normaliseProfile(f.profile)).map(([name, value]) => [name, profileCell(value)])),
        }
      })

      addAudit(ctx, claims, 'export.farmers', 'farmers', `${rows.length} rows`)
      return csvResponse({ filename: 'farmers.csv', columns: CSV_COLUMNS, numericColumns: NUMERIC_COLUMNS, rows })
    }],
  ]
}
