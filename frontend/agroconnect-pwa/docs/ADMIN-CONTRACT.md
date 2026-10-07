# Contract: admin, dashboard and feedback endpoints

For the admin app and the coordinator dashboard (one screen, different scope). Same conventions as `AUTH-CONTRACT.md`: Bearer token on every call, errors as `{ "error", "message" }`, and a built mock in `mock-server/`.

## Who sees what

| Role | Scope |
|------|-------|
| `admin` | Everything. |
| `coordinator` | Only data whose association equals the token's `assoc` claim. Anything outside it returns **404**, not 403, so existence is not revealed. |
| `agent`, `farmer` | No access to `/admin/*` (403). |

Admin screens work **online only**. Every response carries `asOf` (ISO time) so the PWA can show "as of …" when it displays a cached copy.

## Dashboard

### `GET /admin/stats?from=2026-10-01&to=2026-10-07`
Dates optional. Scope is applied from the token.

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

Gender keys are `female`, `male`, `undisclosed`, plus `unknown` for records without it. Crop keys are the eight ids in `API-CONTRACT.md`.

### `GET /admin/income?from&to`
Income per farmer: `[{ "farmerId", "name", "currency", "received" }]`, sorted by `received` descending. The data comes from payments-service.

### `GET /admin/export/farmers.csv` and `/admin/export/payments.csv`
`Content-Type: text/csv`, scoped like the dashboard, UTF-8 with BOM so Excel reads ₵ and Ghanaian letters. Farmer columns: `clientId, id, name, phone, gender, preferredLanguage, community, region, farmSizeAcres, crops (semicolon-separated), lat, lng, accuracyMetres, registeredAt, registeredBy`.

## Heartbeat (for the sync overview)

The server cannot know what is still waiting on a phone, so the app reports it.

### `POST /agents/me/heartbeat` (agent or coordinator)
`{ "pending": 3, "attention": 0, "lastSyncAt": "...", "appVersion": "1.0.0" }` → 204. Sent after each sync run when online.

## Agents (admin only, except where noted)

| Call | Purpose |
|------|---------|
| `GET /admin/agents?status=pending\|approved\|rejected\|suspended` | Returns `{ "items": [...] }`. A coordinator sees only their association's agents. Each item: `id, role, name, phone, assoc, loginId, status`. |
| `POST /admin/agents/:id/approve` | `pending → approved`. Assigns the agent ID (`AG-0042`). |
| `POST /admin/agents/:id/reject` | Body `{ "reason" }`. |
| `POST /admin/agents/:id/suspend` | Body `{ "reason" }`. Takes effect when the phone next refreshes its token. |
| `POST /admin/agents/:id/reinstate` | `suspended → approved`. |
| `POST /admin/coordinators` | Admin only. `{ "name", "phone", "association", "password" }` creates an approved coordinator. |

Each of these writes an audit entry.

## Farmers

`GET /admin/farmers?query=&community=&crop=&page=1` → `{ "items": [...], "total": 412 }`.
`GET /admin/farmers/:id` → the farmer record plus their payments. Scoped as above.

## Audit log and activity

### `GET /admin/audit?page=1`
`{ "items": [{ "at", "actorId", "actorRole", "action", "targetId", "detail" }] }`, newest first. Actions to record: `agent.approve`, `agent.reject`, `agent.suspend`, `agent.reinstate`, `coordinator.create`, `export.farmers`, `export.payments`, `login.failed` (after 3 in a row).

### `GET /admin/activity?type=cropcheck|feedback`
The crop-check list (defined in the advice contract, later) and the feedback inbox.

## Feedback (any signed-in role)

### `POST /feedback`
`{ "clientId", "screen": "wallet", "message": "…", "rating": 1-5 or null, "appLanguage": "tw", "createdAt": "..." }`.
`clientId` is an idempotency key: a repeat returns 200 with the same record and creates nothing new. The PWA saves feedback offline and sends it later, so repeats are normal.

## Not in this contract yet

Crop checks and advice, Wallet and payments, market prices. Each gets its own contract when its screens are built.
