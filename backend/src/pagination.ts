/**
 * One pagination convention for every list endpoint: `?page=1&pageSize=50` (pageSize capped at 100),
 * and a `{ items, total }` response. `sort`/`dir` come from a per-endpoint allow-list so a query
 * parameter can never reach SQL unchecked.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

export interface Page {
  page: number
  pageSize: number
  limit: number
  offset: number
}

export function pageParams(query: URLSearchParams): Page {
  const page = Math.max(1, Number(query.get('page')) || 1)
  const requested = Number(query.get('pageSize')) || DEFAULT_PAGE_SIZE
  const pageSize = Math.min(Math.max(1, Math.floor(requested)), MAX_PAGE_SIZE)
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize }
}

/** `sort` picks a column from the allow-list (anything else falls back); `dir=asc` flips the default. */
export function orderBy(query: URLSearchParams, columns: Record<string, string>, fallback: string, defaultDir: 'asc' | 'desc' = 'desc'): string {
  const column = columns[query.get('sort') ?? ''] ?? fallback
  const dir = (query.get('dir') ?? defaultDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  return `${column} ${dir}`
}

/** The total from a `count(*) OVER()` column, or 0 when there were no rows. */
export const totalOf = (rows: readonly unknown[]): number => {
  const first = rows[0] as { total?: unknown } | undefined
  return first?.total === undefined || first.total === null ? 0 : Number(first.total)
}
