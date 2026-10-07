import { authedJson } from '../auth/authedRequest'
import { API_URL } from '../config'

export const AGENT_STATUSES = ['pending', 'approved', 'suspended', 'rejected'] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]
export type AgentAction = 'approve' | 'reject' | 'suspend' | 'reinstate'

export interface AgentRow {
  id: string
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
  actorRole: string
  action: string
  targetId: string
  detail: string
}

export async function listAgents(status: AgentStatus): Promise<AgentRow[]> {
  const { items } = await authedJson<{ items: AgentRow[] }>(`${API_URL}/admin/agents?status=${status}`)
  return items
}

export function applyAgentAction(id: string, action: AgentAction): Promise<AgentRow> {
  return authedJson<AgentRow>(`${API_URL}/admin/agents/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
}

export function listAdminFarmers(): Promise<{ items: AdminFarmerRow[]; total: number }> {
  return authedJson(`${API_URL}/admin/farmers`)
}

export async function listAudit(): Promise<AuditEntry[]> {
  const { items } = await authedJson<{ items: AuditEntry[] }>(`${API_URL}/admin/audit`)
  return items
}
