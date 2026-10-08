import { HttpError } from './http.js'

/** The calendar day in Ghana (Africa/Accra), as YYYY-MM-DD. Reports count days there, not in UTC. */
export const accraDay = (value: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date(value))

const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface DayRange {
  from: string | null
  to: string | null
}

/** Optional `from` and `to` query dates; anything that is not YYYY-MM-DD is refused. */
export function dateRange(query: URLSearchParams): DayRange {
  const from = query.get('from')
  const to = query.get('to')
  for (const value of [from, to]) {
    if (value && !DATE.test(value)) throw new HttpError(400, 'invalid_request', 'Dates must look like 2026-10-07', { field: 'date' })
  }
  return { from, to }
}

export const inRange = (day: string, { from, to }: DayRange) => (!from || day >= from) && (!to || day <= to)

/** Quotes a value for CSV. Text a spreadsheet would run as a formula gets a leading apostrophe. */
export function csvCell(value: unknown, numeric = false): string {
  let text = String(value ?? '')
  if (!numeric && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** A CSV download. The BOM makes Excel read UTF-8, so ₵ and Ghanaian letters survive. */
export function csvResponse(filename: string, columns: string[], numericColumns: string[], rows: Record<string, unknown>[]): [number, string, Record<string, string>] {
  const numeric = new Set(numericColumns)
  const lines = rows.map((row) => columns.map((column) => csvCell(row[column], numeric.has(column))).join(','))
  const body = `﻿${[columns.join(','), ...lines].join('\r\n')}\r\n`
  return [200, body, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` }]
}
