import { fetchStats, type Stats } from '../admin/adminApi'
import { useCachedRemote } from './useCachedRemote'

const isStats = (value: unknown): value is Stats => typeof value === 'object' && value !== null && 'asOf' in value

export const useStats = () => useCachedRemote('stats', fetchStats, isStats)
