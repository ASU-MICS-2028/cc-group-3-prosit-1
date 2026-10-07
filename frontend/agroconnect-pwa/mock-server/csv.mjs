/** Quotes a value for CSV. Text that a spreadsheet would run as a formula gets a leading apostrophe. */
export function csvCell(value, { numeric = false } = {}) {
  let text = String(value ?? '')
  if (!numeric && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Builds a [status, body, headers] response. The BOM makes Excel read the file as UTF-8, so ₵ and Ghanaian letters survive. */
export function csvResponse({ filename, columns, numericColumns = [], rows }) {
  const numeric = new Set(numericColumns)
  const lines = rows.map((row) => columns.map((column) => csvCell(row[column], { numeric: numeric.has(column) })).join(','))
  const body = `﻿${[columns.join(','), ...lines].join('\r\n')}\r\n`
  return [200, body, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` }]
}
