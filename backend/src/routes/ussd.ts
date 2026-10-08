import type { Express } from 'express'
import { actorOf, CROPS, nowDate, type Ctx } from '../context.js'
import { iso, num, type Queryable, type Row } from '../db.js'
import { HttpError, invalid, jsonBody, notFound, route } from '../http.js'
import { requireAuth, type Claims } from '../security.js'
import { CROP_NAMES, LANGUAGE_MENU, say, type UssdLang } from '../ussdText.js'

/**
 * Feature-phone access over USSD (Prosit brief, Week 1), in Arkesel's format: every key press is a POST
 * with the session ID and only the latest input, so the menu position is kept in ussd_sessions.
 * See docs/api-tier.md and USSD-CONTRACT.md.
 */

interface UssdState {
  lang: UssdLang | null
  menu: 'lang' | 'main' | 'crop' | 'advice' | 'visit'
  /** Advice card IDs in the order they were listed, so "2" means the second one shown. */
  adviceIds?: string[]
}

interface Screen {
  message: string
  continueSession: boolean
}

export interface WeatherToday {
  min: number
  max: number
  rainChance: number
}

export type WeatherSource = (lat: number, lng: number) => Promise<WeatherToday | null>

/** Today's forecast from Open-Meteo (no key). A slow answer is dropped: a USSD session times out quickly. */
export const openMeteoToday: WeatherSource = async (lat, lng) => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max&timezone=Africa%2FAccra&forecast_days=1`
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) }).catch(() => null)
  const body = (await response?.json().catch(() => null)) as { daily?: Record<string, number[]> } | null
  const daily = body?.daily
  if (!response?.ok || !daily) return null
  return { min: Math.round(daily.temperature_2m_min?.[0] ?? 0), max: Math.round(daily.temperature_2m_max?.[0] ?? 0), rainChance: daily.precipitation_probability_max?.[0] ?? 0 }
}

const COUNTRY_BY_PREFIX: [string, 'GH' | 'NG' | 'KE', string][] = [
  ['+233', 'GH', 'GHS'],
  ['+234', 'NG', 'NGN'],
  ['+254', 'KE', 'KES'],
]
const MAX_ADVICE = 4
const SESSION_TTL_HOURS = 24

const asLang = (value: unknown): UssdLang | null => (value === 'en' || value === 'tw' || value === 'ee' ? value : null)
const withBack = (lang: UssdLang, text: string) => `${text}\n${say(lang, 'back')}`
const ask = (message: string): Screen => ({ message, continueSession: true })
const end = (message: string): Screen => ({ message, continueSession: false })

export function ussdRoutes(app: Express, ctx: Ctx): void {
  const { db, signer } = ctx
  const weather: WeatherSource = (lat, lng) => (ctx.weather ?? openMeteoToday)(lat, lng)

  const farmerByPhone = async (q: Queryable, phone: string) =>
    (
      await q.query(
        `SELECT f.*, coalesce(array_agg(c.crop_type ORDER BY c.crop_type) FILTER (WHERE c.crop_type IS NOT NULL), '{}') AS crops
           FROM farmers f LEFT JOIN farmer_crops c ON c.farmer_id = f.id WHERE f.phone_e164 = $1 GROUP BY f.id`,
        [phone],
      )
    ).rows[0] as Row | undefined

  const mainMenu = (lang: UssdLang, prefix = '') => ask(`${prefix}${say(lang, 'main')}`)

  function cropMenu(lang: UssdLang, prefix = ''): Screen {
    const lines = CROPS.map((crop, i) => `${i + 1} ${CROP_NAMES[lang][crop]}`)
    return ask(withBack(lang, `${prefix}${say(lang, 'pickCrop')}\n${lines.join('\n')}`))
  }

  async function priceOf(lang: UssdLang, phone: string, crop: string): Promise<Screen> {
    const [, country, currency] = COUNTRY_BY_PREFIX.find(([prefix]) => phone.startsWith(prefix)) ?? COUNTRY_BY_PREFIX[0]!
    const { rows } = await db.query(
      `SELECT latest.price_per_kg, latest.recorded_on, earlier.price_per_kg AS earlier_price
         FROM market_prices latest
         LEFT JOIN LATERAL (
           SELECT price_per_kg FROM market_prices e
            WHERE e.country = latest.country AND e.crop = latest.crop AND e.recorded_on <= latest.recorded_on - 7
            ORDER BY e.recorded_on DESC LIMIT 1
         ) earlier ON true
        WHERE latest.country = $1 AND latest.crop = $2
        ORDER BY latest.recorded_on DESC LIMIT 1`,
      [country, crop],
    )
    const name = CROP_NAMES[lang][crop] ?? crop
    const row = rows[0]
    if (!row) return end(say(lang, 'noPrice', { crop: name }))
    const price = num(row.price_per_kg) as number
    const earlier = num(row.earlier_price)
    const change = earlier ? Math.round(((price - earlier) / earlier) * 100) : 0
    const trend = change > 0 ? say(lang, 'up', { n: change }) : change < 0 ? say(lang, 'down', { n: -change }) : say(lang, 'flat')
    const date = row.recorded_on instanceof Date ? row.recorded_on.toISOString().slice(0, 10) : String(row.recorded_on).slice(0, 10)
    return end(say(lang, 'price', { crop: name, currency, price: price.toFixed(2), change: trend, date }))
  }

  async function adviceMenu(lang: UssdLang, state: UssdState): Promise<Screen> {
    const { rows } = await db.query('SELECT id, title FROM advice_cards WHERE NOT archived ORDER BY seq DESC LIMIT $1', [MAX_ADVICE])
    if (rows.length === 0) return end(say(lang, 'noAdvice'))
    state.menu = 'advice'
    state.adviceIds = rows.map((row) => row.id)
    return ask(withBack(lang, `${say(lang, 'pickAdvice')}\n${rows.map((row, i) => `${i + 1} ${row.title}`).join('\n')}`))
  }

  async function registration(lang: UssdLang, phone: string): Promise<Screen> {
    const farmer = await farmerByPhone(db, phone)
    if (!farmer) return end(say(lang, 'notRegistered'))
    const crops = (farmer.crops as string[]).map((crop) => CROP_NAMES[lang][crop] ?? crop).join(', ') || say(lang, 'unknown')
    const acres = num(farmer.farm_size_entered)
    return end(say(lang, 'registered', { name: farmer.name, community: farmer.community || say(lang, 'unknown'), crops, size: acres === null ? say(lang, 'unknown') : `${acres} acres` }))
  }

  async function forecast(lang: UssdLang, phone: string): Promise<Screen> {
    const farmer = await farmerByPhone(db, phone)
    if (!farmer || farmer.gps_lat === null) return end(say(lang, 'noWeather'))
    const today = await weather(Number(farmer.gps_lat), Number(farmer.gps_lng)).catch(() => null)
    if (!today) return end(say(lang, 'weatherDown'))
    const line = say(lang, 'weather', { min: today.min, max: today.max, rain: today.rainChance })
    return end(today.rainChance >= 60 ? `${line} ${say(lang, 'weatherTip')}` : line)
  }

  async function step(state: UssdState, phone: string, input: string): Promise<Screen> {
    const lang = state.lang ?? 'en'
    switch (state.menu) {
      case 'lang': {
        const chosen = ({ '1': 'en', '2': 'tw', '3': 'ee' } as const)[input as '1' | '2' | '3']
        if (!chosen) return ask(`${say('en', 'invalid')}\n${LANGUAGE_MENU}`)
        state.lang = chosen
        state.menu = 'main'
        return mainMenu(chosen)
      }
      case 'main':
        switch (input) {
          case '1':
            state.menu = 'crop'
            return cropMenu(lang)
          case '2':
            return adviceMenu(lang, state)
          case '3':
            return registration(lang, phone)
          case '4':
            state.menu = 'visit'
            return ask(say(lang, 'confirmVisit'))
          case '5':
            return forecast(lang, phone)
          case '0':
            return end(say(lang, 'bye'))
          default:
            return mainMenu(lang, `${say(lang, 'invalid')}\n`)
        }
      case 'crop': {
        if (input === '0') return backToMain(state, lang)
        const crop = CROPS[Number(input) - 1]
        return crop && /^\d+$/.test(input) ? priceOf(lang, phone, crop) : cropMenu(lang, `${say(lang, 'invalid')}\n`)
      }
      case 'advice': {
        if (input === '0') return backToMain(state, lang)
        const id = state.adviceIds?.[Number(input) - 1]
        if (!id || !/^\d+$/.test(input)) return adviceMenu(lang, state)
        const { rows } = await db.query('SELECT title, body FROM advice_cards WHERE id = $1', [id])
        return end(rows[0] ? `${rows[0].title}: ${rows[0].body}` : say(lang, 'noAdvice'))
      }
      case 'visit': {
        if (input === '1') {
          await db.tx({ sub: `ussd:${phone}`, role: 'farmer' }, (q) =>
            q.query(`INSERT INTO support_requests (phone_e164, channel, kind, language, created_at, created_by) VALUES ($1, 'ussd', 'agent_visit', $2, $3, $4)`, [
              phone, lang, nowDate(ctx), `ussd:${phone}`,
            ]),
          )
          return end(say(lang, 'visitSent', { phone }))
        }
        return backToMain(state, lang)
      }
    }
  }

  function backToMain(state: UssdState, lang: UssdLang): Screen {
    state.menu = 'main'
    return mainMenu(lang)
  }

  /**
   * USSD gateway callback. Two formats are accepted:
   *  - Nalo Solutions: USERID, MSISDN, USERDATA, MSGTYPE (true = first dial), SESSIONID — upper-case.
   *  - Arkesel: userID, msisdn, userData, newSession, sessionID — camelCase.
   * Replies in the same shape it was called with. 404 unless USSD is configured.
   */
  app.post(
    '/ussd',
    route(async ({ req }) => {
      const expectedUser = ctx.settings.ussdUserId
      if (!expectedUser) throw notFound('route')
      const body = jsonBody(req)

      // Nalo upper-cases its fields; Arkesel uses camelCase. Detect and normalise.
      const nalo = body.USERID !== undefined || body.SESSIONID !== undefined || body.MSGTYPE !== undefined
      const account = String((nalo ? body.USERID : body.userID) ?? '')
      const sessionID = String((nalo ? body.SESSIONID : body.sessionID) ?? '')
      const rawMsisdn = String((nalo ? body.MSISDN : body.msisdn) ?? '')
      const userData = String((nalo ? body.USERDATA : body.userData) ?? '')
      const newSession = nalo
        ? body.MSGTYPE === true || body.MSGTYPE === 1 || body.MSGTYPE === '1' || body.MSGTYPE === 'true'
        : body.newSession === true

      if (account !== expectedUser) throw new HttpError(403, 'forbidden', 'Unknown USSD account')
      const msisdn = rawMsisdn.replace(/^\+/, '')
      if (!sessionID || !/^[1-9]\d{7,14}$/.test(msisdn)) throw invalid('msisdn', 'sessionID and msisdn are required')
      const phone = `+${msisdn}`
      const input = userData.trim()

      let state: UssdState
      let screen: Screen
      if (newSession) {
        await db.query(`DELETE FROM ussd_sessions WHERE updated_at < now() - interval '${SESSION_TTL_HOURS} hours'`)
        const farmer = await farmerByPhone(db, phone)
        const lang = asLang(farmer?.language)
        state = { lang, menu: lang ? 'main' : 'lang' }
        screen = lang ? mainMenu(lang) : ask(LANGUAGE_MENU)
      } else {
        const saved = (await db.query('SELECT state FROM ussd_sessions WHERE session_id = $1 AND msisdn = $2', [sessionID, msisdn])).rows[0]
        state = (saved?.state as UssdState | undefined) ?? { lang: null, menu: 'lang' }
        screen = saved ? await step(state, phone, input) : ask(LANGUAGE_MENU)
      }

      if (screen.continueSession) {
        await db.query(
          `INSERT INTO ussd_sessions (session_id, msisdn, state, updated_at) VALUES ($1, $2, $3, now())
           ON CONFLICT (session_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
          [sessionID, msisdn, JSON.stringify(state)],
        )
      } else {
        await db.query('DELETE FROM ussd_sessions WHERE session_id = $1', [sessionID])
      }
      return [
        200,
        nalo
          ? { USERID: account, MSISDN: rawMsisdn, MSG: screen.message, MSGTYPE: screen.continueSession }
          : { sessionID, userID: account, msisdn: rawMsisdn, message: screen.message, continueSession: screen.continueSession },
      ]
    }),
  )

  // Requests from feature-phone farmers, for coordinators and admins to follow up ---------------------

  /** Admins see all; a coordinator sees requests from their association's farmers and from unregistered callers. */
  const visible = (claims: Claims, row: Row) => claims.role === 'admin' || row.area === null || row.area === claims.assoc

  const REQUEST_SELECT = `
    SELECT r.*, f.id AS farmer_id, f.name AS farmer_name, f.community AS farmer_community, reg.association_id AS area, h.name AS handled_by_name
      FROM support_requests r
      LEFT JOIN farmers f ON f.phone_e164 = r.phone_e164
      LEFT JOIN users reg ON reg.id = f.created_by
      LEFT JOIN users h ON h.id = r.handled_by`

  const view = (row: Row) => ({
    id: row.id,
    phone: row.phone_e164,
    channel: row.channel,
    kind: row.kind,
    language: row.language,
    status: row.status,
    createdAt: iso(row.created_at),
    farmer: row.farmer_id === null ? null : { id: String(row.farmer_id), name: row.farmer_name, community: row.farmer_community },
    handledBy: row.handled_by_name ?? null,
    handledAt: iso(row.handled_at),
  })

  app.get(
    '/admin/requests',
    route(async ({ req, query }) => {
      const claims = await requireAuth(signer, req, ['admin', 'coordinator'])
      const status = query.get('status')
      if (status && status !== 'open' && status !== 'done') throw invalid('status', 'status must be open or done')
      const { rows } = await db.query(`${REQUEST_SELECT} WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.seq DESC LIMIT 200`, [status])
      return [200, { items: rows.filter((row) => visible(claims, row)).map(view) }]
    }),
  )

  app.post(
    '/admin/requests/:id/done',
    route(async ({ req, params }) => {
      const claims = await requireAuth(signer, req, ['admin', 'coordinator'])
      const row = (await db.query(`${REQUEST_SELECT} WHERE r.id = $1`, [params.id])).rows[0]
      if (!row || !visible(claims, row)) throw notFound('request')
      await db.tx(actorOf(claims), (q) =>
        q.query(`UPDATE support_requests SET status = 'done', handled_by = $2, handled_at = $3 WHERE id = $1 AND status = 'open'`, [row.id, claims.sub, nowDate(ctx)]),
      )
      return [200, view((await db.query(`${REQUEST_SELECT} WHERE r.id = $1`, [params.id])).rows[0] as Row)]
    }),
  )

}
