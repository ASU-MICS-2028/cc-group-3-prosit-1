# API contract: PWA ↔ farmer-profile-service

What the PWA sends and expects when it registers farmers, and how each part lands in Postgres. Start here: the shared conventions below apply to `AUTH-CONTRACT.md` and `ADMIN-CONTRACT.md` too.

The PWA saves everything on the phone first and sends later, sometimes hours later and sometimes twice. Everything below exists to make that safe.

## Document map and which one wins

| Document | Covers | Where |
|----------|--------|-------|
| `DATA-CONTRACT.md` | The database: tables, constraints, migrations, audit | repo root |
| `API-CONTRACT.md` (this) | The wire format for registering farmers, photos, `GET /farmers/me` | `frontend/agroconnect-pwa/docs/` |
| `AUTH-CONTRACT.md` | Sign-in, approval of agents, tokens | same folder |
| `ADMIN-CONTRACT.md` | Dashboard, agent approvals, audit view, feedback | same folder |
| `PAYMENTS-CONTRACT.md` | Wallet: mobile-money payments, balance, loan requests | same folder |
| `ADVICE-CONTRACT.md` | Crop checks: a farmer's photo and question, the extension officer's answer | same folder |
| `LISTINGS-CONTRACT.md` | Produce for sale, browsed by buyers | same folder |
| `CONTENT-CONTRACT.md` | Market prices and advice cards entered by admins and coordinators | same folder |

**If two documents disagree:** `DATA-CONTRACT.md` wins on how data is *stored*; these three win on what is *sent over the wire*. Anything not settled by either is listed under "Open items" at the end.

The reference behaviour for the wire format is `mock-server/` (`npm run mock`), which has tests for every case here.

## Conventions shared by all three contracts

**Phone numbers.** One canonical form, E.164: `+` and the country code, then the national number *without* the leading 0. Ghana: `+233` plus 9 digits.

| Where | What the PWA sends |
|-------|--------------------|
| Registering a farmer (this contract) | `countryCode: "+233"` and `phoneNational: "241234567"` as two fields, matching `DATA-CONTRACT.md` §2 |
| Sign-in, sign-up and admin calls (`AUTH`, `ADMIN`) | one field, `phone: "+233241234567"` (the same two parts joined) |

The PWA keeps a single phone box and builds both forms from what was typed: `0241234567`, `233241234567` and `+233241234567` all become `+233` + `241234567`. The database stores `phone_e164` (generated, unique). It is the join key between a login account and a farmer record, so auth-service must store and compare phones in E.164 too.

**Errors.** Every error body is `{ "error": "<code>", "message": "<readable text>" }`, plus extra fields where a contract says so. `message` is shown to a registerer, so keep it plain. Codes the PWA acts on: 400, 401, 403, 404, 409, 413, 429, and 5xx (retry later).

**Who did it.** The acting user is the token's `sub`. It is *never* read from the request body. The service stores it in `created_by` / `updated_by` and passes it to the audit trigger (see the reference code).

**Idempotency.** Anything the phone creates offline carries a `clientId` (UUID) with a `UNIQUE` column behind it. The service inserts, catches Postgres error `23505`, checks the constraint name, and answers 200 with the existing record for a repeat. It never searches first. Feedback uses the same pattern.

**Postgres error → HTTP status** (from `DATA-CONTRACT.md` §6):

| Situation | SQLSTATE / constraint | Status |
|-----------|----------------------|--------|
| New record | insert succeeds | 201 + `id` |
| Same `clientId` again | `23505`, `farmers_client_id_key` | 200 + existing `id` |
| Different `clientId`, same phone | `23505`, `farmers_phone_e164_key` | 409 + reason |
| Missing required field | `23502`, or checked in code | 400 |
| Value outside an allowed list (language, gender) | `23514` | 400 |
| No token / bad token | n/a | 401 |
| Wrong role | n/a | 403 |

**IDs.** `id` is whatever the database assigns (a number today). The PWA treats it as opaque text and always sends it back unchanged.

**Time.** Timestamps on the wire are ISO 8601 strings with an offset (UTC is fine). A "day" in any report is a day in `Africa/Accra`.

**Roles.** `farmer`, `agent`, `coordinator`, `admin`, from the token's `role` claim.

## What changed since the version `DATA-CONTRACT.md` replied to

| Change | Detail |
|--------|--------|
| Phone is split | `countryCode` + `phoneNational`, as the data contract asked |
| Everything needs a token | `Authorization: Bearer <token>`; `registeredBy` is derived from it |
| New optional field | `gender` |
| Photo goes to S3 | `POST /farmers/:id/photo`, the API stores the object and keeps the key in `photo_object_key` |
| New endpoint | `GET /farmers/me` links a signed-in farmer to their record |
| GPS time is ISO | `gps.capturedAt` is an ISO string (the PWA will be changed to match) |

## `POST /farmers`

Roles: `agent`, `coordinator`. A `farmer` token gets 403.

| Field | Type | Stored as | Notes |
|-------|------|-----------|-------|
| `clientId` | UUID string | `client_id` | Required. |
| `name` | string | `name` | Required. |
| `countryCode` | string | `country_code` | Required. `"+233"`. |
| `phoneNational` | string | `phone_national` | Required. Digits only, no leading 0. |
| `preferredLanguage` | `"en" \| "tw" \| "ee" \| "dag"` | `language` | |
| `gender` | `"female" \| "male" \| "undisclosed" \| null` | `gender` | Optional. Needs a new column with a CHECK on these values. |
| `community`, `region` | string | same | May be empty. |
| `farmSizeAcres` | number \| null | `farm_size_entered`, `farm_size_unit = 'acres'`, `farm_size_hectares` | The API converts: hectares = acres × 0.404686. |
| `crops` | string[] | `farmer_crops` rows | From: maize, tomato, cassava, pepper, okro, yam, cocoa, plantain. |
| `gps` | `{ lat, lng, accuracy, capturedAt } \| null` | `gps_lat`, `gps_lng`, `gps_accuracy_m`, `gps_captured_at` | `accuracy` in metres, `capturedAt` ISO 8601. |
| `consent` | boolean | `consent` | Always `true`: the PWA will not send without it. |
| `registeredAt` | ISO 8601 | `registered_at`, and `consent_at` when `consent` is true | When it happened on the phone, not when it arrived. |

Responses: see the status table above. The success body is `{ "id": <server id> }`. The PWA marks the farmer **Sent** on 200 or 201, **Needs attention** (showing `message`) on any other 4xx, and keeps the record **Saved on phone** and retries on 408, 429, 5xx or no response.

## `POST /farmers/:id/photo`

Roles: `agent`, `coordinator`. `:id` is the server `id` from the response above. Body: the raw JPEG (`Content-Type: image/jpeg`), about 100 KB, one per farmer.

The API stores the image in S3 and writes the key to `photo_object_key`. This is deliberately a request to the API, not a pre-signed upload: the phone then never holds bucket access, and the bucket needs no CORS rules.

| Status | PWA behaviour |
|--------|---------------|
| 200 `{ "bytes": n }` | Photo marked sent. |
| 404 unknown id, 413 over 500 KB, other 4xx | Not retried. |
| 408, 429, 5xx, no response | Retried later. |

## Extension visits

The brief requires extension agents to "track farmer interactions and progress". An agent logs a visit on the farmer's screen; it is saved on the phone and sent with the outbox, like everything else created offline.

### `POST /farmers/:id/visits`

Roles: `agent`, `coordinator`, for a farmer they may see (an agent: farmers they registered; a coordinator: their association's). Otherwise 404.

| Field | Type | Notes |
|-------|------|-------|
| `clientId` | UUID | Required. A repeat answers 200 with the same `id`; 409 `client_id_taken` if it is another account's. |
| `visitedAt` | ISO 8601 | When it happened on the phone. Defaults to now. |
| `topics` | list | At least one of `advice`, `inputs`, `pests`, `market`, `training`, `credit`, `records`, `follow_up`. |
| `notes` | string | Optional, at most 500 characters. |
| `nextVisit` | `YYYY-MM-DD` \| null | Optional. |

201 `{ "id": "EV-12" }`. Bad values are 400 with `field`. Stored in `extension_visits` (migration 006), audited.

### `GET /farmers/:id/visits`

Roles: `agent`, `coordinator`, `admin`, scoped as above. `{ "items": [{ "id", "clientId", "farmerId", "visitedAt", "topics", "notes", "nextVisit", "agentName" }] }`, newest first.

## `GET /farmers/me`

Role: `farmer`. Finds the record whose `phone_e164` equals the token's phone, and returns it. 404 if no agent has registered this farmer yet. This is how a farmer who was registered by an agent sees their own profile after signing in.

## `GET /health`, `GET /farmers/:id`

`/health` unchanged. `GET /farmers/:id` is for `agent`, `coordinator` and `admin`.

## Authorization

Every endpoint except `/health` needs `Authorization: Bearer <token>`. The token is signed by auth-service; verify it with the public key at `GET <auth-service>/.well-known/jwks.json` (for example with the `jose` library's `createRemoteJWKSet`). CORS must allow the hosted PWA's origin and the `Authorization` and `Content-Type` headers. A missing, invalid or expired token returns 401; the PWA then refreshes its token once and retries.

## Reference Node/Express code

Illustrative, not copy-paste: adapt names to the service. It follows `DATA-CONTRACT.md`: insert, catch the constraint, never search first.

```js
const ACRES_TO_HECTARES = 0.404686
const CLIENT_ID_KEY = 'farmers_client_id_key'
const PHONE_KEY = 'farmers_phone_e164_key'

app.use(cors({ origin: process.env.PWA_ORIGIN, allowedHeaders: ['Content-Type', 'Authorization'] }))
app.use(express.json())

app.post('/farmers', requireRole('agent', 'coordinator'), async (req, res) => {
  const f = req.body
  if (!f.clientId || !f.name || !f.countryCode || !f.phoneNational) {
    return res.status(400).json({ error: 'invalid_request', message: 'name, phone and clientId are required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // SET LOCAL cannot take parameters; set_config(..., true) is the safe equivalent.
    await client.query("SELECT set_config('app.actor', $1, true)", [req.user.sub])

    const acres = f.farmSizeAcres ?? null
    const { rows: [farmer] } = await client.query(
      `INSERT INTO farmers
         (client_id, name, country_code, phone_national, language, gender, community, region,
          farm_size_entered, farm_size_unit, farm_size_hectares,
          gps_lat, gps_lng, gps_accuracy_m, gps_captured_at,
          consent, consent_at, registered_at, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'acres',$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
       RETURNING id`,
      [f.clientId, f.name, f.countryCode, f.phoneNational, f.preferredLanguage, f.gender ?? null,
       f.community ?? null, f.region ?? null, acres, acres === null ? null : acres * ACRES_TO_HECTARES,
       f.gps?.lat ?? null, f.gps?.lng ?? null, f.gps?.accuracy ?? null, f.gps?.capturedAt ?? null,
       f.consent === true, f.consent === true ? f.registeredAt : null, f.registeredAt, req.user.sub],
    )

    if (f.crops?.length) {
      await client.query(
        `INSERT INTO farmer_crops (farmer_id, crop_type, created_by, updated_by)
         SELECT $1, unnest($2::text[]), $3, $3`,
        [farmer.id, f.crops, req.user.sub],
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ id: farmer.id })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505' && error.constraint === CLIENT_ID_KEY) {
      const { rows: [existing] } = await pool.query('SELECT id FROM farmers WHERE client_id = $1', [f.clientId])
      return res.status(200).json({ id: existing.id })
    }
    if (error.code === '23505' && error.constraint === PHONE_KEY) {
      return res.status(409).json({ error: 'duplicate_phone', message: 'A farmer with this phone number is already registered' })
    }
    if (error.code === '23502' || error.code === '23514') {
      return res.status(400).json({ error: 'invalid_request', message: error.detail ?? 'Invalid farmer data' })
    }
    throw error
  } finally {
    client.release()
  }
})

app.post('/farmers/:id/photo', requireRole('agent', 'coordinator'),
  express.raw({ type: 'image/jpeg', limit: '500kb' }), async (req, res) => {
    const key = `farmers/${req.params.id}/photo.jpg`
    await s3.send(new PutObjectCommand({ Bucket: process.env.PHOTO_BUCKET, Key: key, Body: req.body, ContentType: 'image/jpeg' }))
    const { rowCount } = await pool.query('UPDATE farmers SET photo_object_key = $1, updated_by = $2 WHERE id = $3',
      [key, req.user.sub, req.params.id])
    if (rowCount === 0) return res.status(404).json({ error: 'not_found', message: 'Unknown farmer' })
    res.status(200).json({ bytes: req.body.length })
  })
```

An oversized body makes `express.raw` raise a 413 on its own; make sure your error handler returns it as `{ error, message }`.

## Check it works

1. Start the real service and set `VITE_API_URL` to its address.
2. Register one farmer in the PWA with data on. It shows **Sent**, and `SELECT phone_e164 FROM farmers` shows `+233…`.
3. Register a second farmer with the same phone number written differently (`024…` and `+233 24…`). It shows **Needs attention** with the 409 reason.
4. Send the same `POST /farmers` body twice with `curl`. Both replies carry the same `id`.
5. Check `audit_log`: the newest `farmers` row has `app_actor` set to the agent's ID.

## Open items for the backend

**Status (8 Oct 2026): all ten are resolved** in `backend/migrations/001_initial.sql` and `backend/src/`. The backend's test suite (`backend/test/`) runs the mock server's contract tests against the real API on Postgres.

| # | Item | Why it is needed |
|---|------|------------------|
| 1 | Add a `gender` column to `farmers` (`female`, `male`, `undisclosed`, nullable, with a CHECK) | The PWA sends it; the brief asks for gender-disaggregated reporting |
| 2 | Link each farmer to the agent and association that registered them: `created_by` holds the agent's user ID, and the users table (see `AUTH-CONTRACT.md`) holds the association | Coordinators may only see their own association's farmers |
| 3 | `consent_at` comes from `registered_at`, not server time | Consent was given at the phone, at registration |
| 4 | Drop `farm_crops` and `farm_media` from `schema.sql`, or say what they are for | The data contract replaces them with `farmer_crops` and `photo_object_key` |
| 5 | Tables for the other contracts: users and OTP codes (`AUTH`), feedback and agent sync status (`ADMIN`), payments and loan requests (`PAYMENTS`), crop checks (`ADVICE`), listings (`LISTINGS`) | Listed in the "Storage" sections of those documents |
| 6 | Confirm 400 (not FastAPI-style 422) for missing fields, and `{ error, message }` for every error | The PWA shows `message` to the registerer |
| 7 | CORS for the hosted PWA origin including `Authorization` | Browsers block the PWA without it |
| 8 | Migration C1 copies the old `phone` column into `phone_national` unchanged. If any rows exist, strip a leading `0` or `+233` in that `UPDATE`, for example `regexp_replace(phone, '^(\+233\|233\|0)', '')` | Otherwise `0241234567` becomes `+2330241234567` |
| 9 | Make `client_id` `NOT NULL UNIQUE` in migration C2 (it is currently nullable) | A nullable unique column allows many NULLs, so a request without a `clientId` would skip the idempotency check, and the missing-field case would never raise `23502` |
| 10 | In `DATA-CONTRACT.md` §5, `SET LOCAL app.actor = '<…>'` cannot take a parameter; use `SELECT set_config('app.actor', $1, true)` from the service | Building that statement from a string invites SQL injection through the agent ID |
