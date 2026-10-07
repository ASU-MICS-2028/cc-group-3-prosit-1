import { authedJson, authedRequest } from '../auth/authedRequest'
import { ADMIN_URL } from '../config'
import type { Role } from '../domain/auth'
import type { Currency } from '../domain/country'
import { e164OrReject } from '../lib/phoneInput'
import { jsonPost } from '../sync/send'

export const AGENT_STATUSES = ['pending', 'approved', 'suspended', 'rejected'] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]
export type AgentAction = 'approve' | 'reject' | 'suspend' | 'reinstate'

export interface StaffRow {
  id: string
  role: Role
  name: string
  phone: string
  assoc?: string
  loginId: string | null
  status: string
}

export interface AdminFarmerRow {
  id: string
  name: string
  phone: string
  community?: string
  region?: string
  registeredByName?: string
}

export interface AuditEntry {
  at: string
  actorId: string
  actorRole?: string
  action: string
  targetId: string
  detail: string
}

export async function listAgents(status: AgentStatus): Promise<StaffRow[]> {
  const { items } = await authedJson<{ items: StaffRow[] }>(`${ADMIN_URL}/admin/agents?status=${status}`)
  return items
}

export function applyAgentAction(id: string, action: AgentAction): Promise<StaffRow> {
  return authedJson<StaffRow>(`${ADMIN_URL}/admin/agents/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}

export type CoordinatorAction = 'suspend' | 'reinstate'

export async function listCoordinators(): Promise<StaffRow[]> {
  const { items } = await authedJson<{ items: StaffRow[] }>(`${ADMIN_URL}/admin/coordinators`)
  return items
}

export interface NewCoordinator {
  name: string
  phone: string
  association: string
  password: string
}

export function createCoordinator(input: NewCoordinator): Promise<StaffRow> {
  return authedJson<StaffRow>(`${ADMIN_URL}/admin/coordinators`, jsonPost({ ...input, phone: e164OrReject(input.phone) }))
}

export function applyCoordinatorAction(id: string, action: CoordinatorAction): Promise<StaffRow> {
  return authedJson<StaffRow>(`${ADMIN_URL}/admin/coordinators/${encodeURIComponent(id)}/${action}`, jsonPost({}))
}

export function listAdminFarmers(): Promise<{ items: AdminFarmerRow[]; total: number }> {
  return authedJson(`${ADMIN_URL}/admin/farmers`)
}

export async function listAudit(): Promise<AuditEntry[]> {
  const { items } = await authedJson<{ items: AuditEntry[] }>(`${ADMIN_URL}/admin/audit`)
  return items
}

export interface CountRow {
  key: string
  count: number
}

export interface Stats {
  asOf: string
  totals: { farmers: number; agentsActive: number; farmersToday: number }
  byDay: CountRow[]
  byCommunity: CountRow[]
  byCrop: CountRow[]
  byLanguage: CountRow[]
  byGender: CountRow[]
  byAgent: { agentId: string; name: string; count: number; lastSeenAt: string | null }[]
  sync: { agentId: string; pending: number; attention: number; lastSyncAt: string | null }[]
  payments: { currency: Currency; collected: number; paidOut: number }[]
}

export function fetchStats(): Promise<Stats> {
  return authedJson<Stats>(`${ADMIN_URL}/admin/stats`)
}

export type CsvKind = 'farmers' | 'payments'

export async function fetchCsv(kind: CsvKind): Promise<Blob> {
  const response = await authedRequest(`${ADMIN_URL}/admin/export/${kind}.csv`)
  return response.blob()
}

export interface IncomeRow {
  farmerId: string
  name: string
  currency: Currency
  received: number
}

export async function fetchIncome(): Promise<IncomeRow[]> {
  const { items } = await authedJson<{ items: IncomeRow[] }>(`${ADMIN_URL}/admin/income`)
  return items
}

export interface FeedbackEntry {
  id: string
  at: string
  name: string
  role: string
  screen: string
  message: string
  rating: number | null
}

export async function fetchFeedbackInbox(): Promise<FeedbackEntry[]> {
  const { items } = await authedJson<{ items: FeedbackEntry[] }>(`${ADMIN_URL}/admin/activity?type=feedback`)
  return items
}
