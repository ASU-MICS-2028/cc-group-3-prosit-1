/** The calendar day in Ghana, as YYYY-MM-DD. */
export const accraDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date(iso))

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Reads optional `from` and `to` query dates; anything that is not YYYY-MM-DD is refused. */
export function dateRange(query, HttpError) {
  const [from, to] = [query.get('from'), query.get('to')]
  for (const value of [from, to]) {
    if (value && !DATE.test(value)) throw new HttpError(400, 'invalid_request', 'Dates must look like 2026-10-07', { field: 'date' })
  }
  return { from, to }
}

export const inRange = (day, { from, to }) => (!from || day >= from) && (!to || day <= to)
