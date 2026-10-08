import { authedJson } from '../auth/authedRequest'
import { API_URL } from '../config'
import type { VisitTopic } from '../domain/outbox'

export interface VisitView {
  id: string
  clientId: string
  farmerId: string
  visitedAt: string
  topics: VisitTopic[]
  notes: string
  nextVisit: string | null
  agentName: string | null
}

export const isVisitList = (value: unknown): value is { items: VisitView[] } =>
  typeof value === 'object' && value !== null && Array.isArray((value as { items: unknown }).items)

export const fetchVisits = (farmerId: string) => authedJson<{ items: VisitView[] }>(`${API_URL}/farmers/${encodeURIComponent(farmerId)}/visits`)
