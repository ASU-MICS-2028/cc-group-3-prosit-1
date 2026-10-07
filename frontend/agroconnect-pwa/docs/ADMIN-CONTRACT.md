# Contract: admin, dashboard and feedback endpoints

For the admin app and the coordinator dashboard (one screen, different scope). Read the conventions in `API-CONTRACT.md` first: phone format, error shape, who-did-it, idempotency, time zone, and which document wins over which. A built mock with tests is in `mock-server/`.

## Who sees what

| Role | Scope |
|------|-------|
| `admin` | Everything. |
| `coordinator` | Only data whose association equals the token's `assoc` claim. Anything outside it returns **404**, not 403, so existence is not revealed. |
| `agent`, `farmer` | No access to `/admin/*` (403). |

**How "association" reaches a farmer:** `farmers.created_by` holds the registering agent's user ID, and that user's `association_id` (see `AUTH-CONTRACT.md`) is the association. A coordinator sees farmers whose creator belongs to their association.

Admin screens work **online only**. Every response carries `asOf` (ISO time) so the PWA can show "as of …" when it displays a cached copy.

## Dashboard

### `GET /admin/stats?from=2026-10-01&to=2026-10-07`
Dates optional. Scope is applied from the token. Registrations are counted by `registered_at` (when it happened on the phone), and a day is a day in `Africa/Accra`.

```json
{
  "asOf": "2026-10-05T14:03:00Z",
  "totals": { "farmers": 412, "agentsActive": 18, "farmersToday": 37 },
  "byDay":      [{ "key": "2026-10-05", "count": 37 }],
  "byCommunity":[{ "key": "Ashaiman", "count": 120 }],
  "byCrop":     [{ "key": "maize", "count": 210 }],
  "byLanguage": [{ "key": "tw", "count": 180 }],
  "byGender":   [{ "key": "female", "count": 190 }],
  "byAgent":    [{ "agentId": "AG-0042", "name": "Kofi A.", "count": 55, "lastSeenAt": "..." }],
  "sync":       [{ "agentId": "AG-0042", "pending": 3, "attention": 0, "lastSyncAt": "..." }],
  "payments":   [{ "currency": "GHS", "collected": 1250.0, "paidOut": 400.0 }]
}
```

`byCrop` counts `farmer_crops` rows, so a farmer who grows two crops counts once in each. Gender keys are `female`, `male`, `undisclosed`, plus `unknown` for records with a null `gender`. `agentId` in `byAgent` and `sync` is the agent's `login_id`. `lastSeenAt` is the agent's latest `agent_sync_status.updated_at`.

### `GET /admin/income?from&to`
Income per farmer: `[{ "farmerId", "name", "currency", "received" }]`, sorted by `received` descending. The data comes from payments-service.

### `GET /admin/export/farmers.csv` and `/admin/export/payments.csv`
`Content-Type: text/csv`, scoped like the dashboard, UTF-8 with BOM so Excel reads ₵ and Ghanaian letters.

Farmer columns: `clientId, id, name, phoneE164, gender, preferredLanguage, community, region, farmSizeHectares, farmSizeEntered, farmSizeUnit, crops (semicolon-separated), lat, lng, accuracyMetres, registeredAt, createdAt, registeredBy`. Hectares is the canonical size (it is what MoFA reports in); the entered value and its unit are kept beside it so a conversion mistake stays recoverable. `registeredBy` is the agent's `login_id`.

## Heartbeat (for the sync overview)

The server cannot know what is still waiting on a phone, so the app reports it.

### `POST /agents/me/heartbeat` (agent or coordinator)
`{ "pending": 3, "attention": 0, "lastSyncAt": "...", "appVersion": "1.0.0" }` → 204. Sent after each sync run when online. It carries counts only, never farmer data.

Store one row per agent and overwrite it each time; no history is needed:

`agent_sync_status(agent_id, pending, attention, last_sync_at, app_version, updated_at)`

## Agents (admin only, except where noted)

| Call | Purpose |
|------|---------|
| `GET /admin/agents?status=pending\|approved\|rejected\|suspended` | Returns `{ "items": [...] }`. A coordinator sees only their association's agents. Each item: `id, role, name, phone (E.164), assoc, loginId, status`. |
| `POST /admin/agents/:id/approve` | `pending → approved`. Assigns the agent ID (`AG-0042`). |
| `POST /admin/agents/:id/reject` | Body `{ "reason" }`, stored in `users.status_reason`. |
| `POST /admin/agents/:id/suspend` | Body `{ "reason" }`. Takes effect when the phone next refreshes its token. |
| `POST /admin/agents/:id/reinstate` | `suspended → approved`. |
| `POST /admin/coordinators` | Admin only. `{ "name", "phone" (E.164), "association", "password" }` creates an approved coordinator. |

An action on an agent in the wrong state returns 409 `invalid_transition`. Each action is audited (below).

## Farmers

`GET /admin/farmers?query=&community=&crop=&page=1` → `{ "items": [...], "total": 412 }`. Each item: `id, name, phone (E.164), community, region, registeredByName`.
`GET /admin/farmers/:id` → the farmer record plus their payments. Scoped as above.

## Audit log and activity

### `GET /admin/audit?page=1`

Admin only. The source is the `audit_log` table from `DATA-CONTRACT.md` §5. Responses are newest first:

```json
{ "items": [{ "at": "...", "actorId": "ADM-001", "action": "agent.approve", "targetId": "U-17", "detail": "status: pending → approved" }] }
```

| Field | Comes from |
|-------|-----------|
| `at` | `changed_at` |
| `actorId` | `app_actor` (the acting user's ID; never the database user) |
| `targetId` | `record_id` |
| `action` | See below |
| `detail` | A short text of what changed (for an update: the changed columns and their old and new values) |
| `actorRole` | Optional. Include it if easy; the PWA shows it when present. |

**`action`** is derived from the row. For `users` rows whose `status` changed: `pending → approved` is `agent.approve`, `pending → rejected` is `agent.reject`, `approved → suspended` is `agent.suspend`, `suspended → approved` is `agent.reinstate`. Everything else is `<table>.<insert|update|delete>`, for example `farmers.insert`. A coordinator being created appears as `users.insert`.

Events that are not table changes (an export, repeated failed logins) are optional. If you record them, insert a row into `audit_log` with `table_name = 'app'` and a clear `action`.

### `GET /admin/activity?type=cropcheck|feedback`
The crop-check list (defined in the advice contract, later) and the feedback inbox.

## Feedback (any signed-in role)

### `POST /feedback`
`{ "clientId", "screen": "wallet", "message": "…", "rating": 1-5 or null, "appLanguage": "tw", "createdAt": "..." }`.

The same idempotency pattern as farmers: a `feedback` table with `client_id UUID UNIQUE`, insert, catch `23505` on that constraint, and answer 200 with the existing record. The PWA saves feedback offline and sends it later, so repeats are normal. Store the sender's user ID from the token in `created_by`.

## Tables this contract adds

`agent_sync_status`, `feedback`, and the audit trigger on `users` (from `AUTH-CONTRACT.md`). Nothing here changes the farmer tables in `DATA-CONTRACT.md`.

## Not in this contract yet

Crop checks and advice, Wallet and payments, market prices. Each gets its own contract when its screens are built.
