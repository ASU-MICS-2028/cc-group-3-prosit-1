import { authedJson } from '../auth/authedRequest'
import { ADMIN_URL } from '../config'
import { jsonPost } from '../sync/send'

/** A farmer asking for help outside the app, today from USSD (USSD-CONTRACT.md). */
export interface SupportRequest {
  id: string
  phone: string
  channel: 'ussd' | 'app'
  kind: 'agent_visit'
  language: string | null
  status: 'open' | 'done'
  createdAt: string
  farmer: { id: string; name: string; community: string | null } | null
  handledBy: string | null
  handledAt: string | null
}

export const fetchRequests = (status: 'open' | 'done') =>
  authedJson<{ items: SupportRequest[] }>(`${ADMIN_URL}/admin/requests?status=${status}`)

export const markRequestDone = (id: string) =>
  authedJson<SupportRequest>(`${ADMIN_URL}/admin/requests/${encodeURIComponent(id)}/done`, jsonPost({}))
