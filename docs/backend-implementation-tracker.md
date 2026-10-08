# AgroConnect Ghana — Backend & Data Implementation Tracker

**Project:** AgroConnect Ghana
**Backend:** Node.js + Express (TypeScript)
**Database:** PostgreSQL 16 / AWS RDS
**API:** https://api.agroconnect.space
**AWS target region:** `af-south-1` (Africa/Cape Town)

## How we use this tracker

Master implementation tracker for the production API. The code lives in [`backend/`](../backend);
the wire contracts are in [`frontend/agroconnect-pwa/docs/`](../frontend/agroconnect-pwa/docs).
This file mirrors the original tracker and records the true status of each phase **as verified
against the code on `main`**, not against intentions.

### Statuses

- ⬜ Not started
- 🟡 In progress
- 🟢 Verified
- 🔴 Blocked / needs decision

**Important:** Code being written does not mean a task is complete. A task becomes **Verified** only after we test or otherwise confirm it.

### Checkbox legend

- `[x]` done and verified (tests or manual confirmation)
- `[~]` partial — some of the item exists, the rest is tracked in a later phase
- `[ ]` not done

---

## Status at a glance

| Phase | Status | Notes |
|---|---|---|
| 0 — Requirements & Architecture Baseline | 🟢 | Contracts + ADRs recorded; pagination and rate-limit conventions defined |
| 1 — Backend Project Foundation | 🟢 | Complete (PR #34) |
| 2 — Database & Migration | 🟢 | Complete (PR #35) |
| 3 — Authentication | 🟢 | Complete (PR #37); logout/revocation and password change stay out of contract |
| 4 — Authorization & Access Control | 🟢 | Complete (PR #38) |
| 5 — Farmer Profile API | 🟢 | Complete (PR #39) |
| 6 — Offline Sync & Idempotency | 🟢 | `client_id NOT NULL UNIQUE` insert-and-catch everywhere, concurrency tested |
| 7 — Photo Storage | 🟢 | Complete (PR #44) |
| 8 — Rate Limiting & Abuse Protection | 🟢 | Complete (PR #41) |
| 9 — Admin & Coordinator API | 🟢 | Complete (PR #43) |
| 10 — Pagination, Filtering & Query Performance | 🟢 | Complete (PR #47); optional load test left |
| 11 — Feedback API | 🟢 | Complete (PR #48) |
| 12 — Audit & Observability | 🟢 | Complete (PR #49) |
| 13 — AWS Infrastructure | 🟢 | Complete; stale docs corrected (PR #51) |
| 14 — Production Deployment | 🟢 | Complete (PR #52) |
| 15 — Testing & Production Readiness | 🟢 | Complete (PR #54); see Remaining |

Phase **16**, further down, covers four features added after this tracker was drafted (farmer profile
extension, USSD access for feature phones, extension visit log, push notifications). Phase **17** covers
session revocation, credential change and farmer editing.

---

# Phase 0 — Requirements & Architecture Baseline

**Goal:** Establish exactly what we are building before changing production code.

- [x] Confirm backend repository structure
- [x] Confirm whether `auth-service` is separate or part of the Express API _(one service — ADR-013)_
- [x] Confirm current PostgreSQL implementation
- [x] Confirm AWS deployment architecture
- [x] Confirm authentication implementation
- [x] Resolve API phone-field decision _(split `country_code` + `phone_national`, generated `phone_e164`)_
- [x] Define pagination convention _(?page=&pageSize=, capped at 100, `{ items, total }`)_
- [x] Define general rate-limit policy _(per-IP global 300/min + stricter auth 20/min, 429 with Retry-After)_
- [x] Resolve contract inconsistencies _(DATA/API/AUTH/ADMIN/ADVICE/LISTINGS/PAYMENTS contracts)_
- [x] Record final architecture decisions _(ADRs 001–013)_

**Status:** 🟢 Verified

---

# Phase 1 — Backend Project Foundation

**Goal:** Establish a clean production Express foundation.

- [x] Node.js/Express application structure
- [x] Environment configuration
- [x] `.env.example`
- [x] Configuration validation _(fail-fast before the first connection)_
- [x] Centralized error-handling middleware
- [x] 404/not-found handling
- [x] Request validation middleware _(per-route; no shared schema library)_
- [x] Security headers _(helmet)_
- [x] CORS configuration
- [x] Request/body size limits
- [x] Structured logging _(pino JSON)_
- [x] Request/correlation ID _(`X-Request-Id`)_
- [x] Graceful shutdown _(SIGTERM + SIGINT, force-exit timeout)_
- [x] `/health`
- [x] `/ready` or readiness check
- [x] Production error responses _(with error IDs)_
- [x] Ensure sensitive information is not exposed in errors/logs

**Status:** 🟢 Verified (PR #34)

---

# Phase 2 — Database & Migration

**Goal:** Make PostgreSQL match the agreed Data Contract safely.

- [x] Inspect existing schema
- [x] Establish migration system _(SQL files + `schema_migrations` + advisory lock, applied on boot)_
- [x] `farmers` schema
- [x] `farms` schema _(obsolete — farm-centric model dropped, DATA-CONTRACT §1)_
- [x] `farmer_crops`
- [x] Phone representation
- [x] `client_id` uniqueness
- [x] Phone uniqueness
- [x] Language constraint
- [x] Consent fields
- [x] GPS fields
- [x] Farm-size fields
- [x] Photo object key
- [x] `created_at`
- [x] `updated_at`
- [x] `created_by`
- [x] `updated_by`
- [x] `audit_log`
- [x] Audit triggers
- [x] Required indexes _(migration 003 adds the audit, list and join indexes)_
- [x] Foreign keys
- [x] Delete/update behaviour _(user/association FKs are ON DELETE RESTRICT; the two intentional CASCADEs remain)_
- [x] Database migration testing
- [x] Rollback strategy _(forward-only; documented in `db/README.md`)_

**Status:** 🟢 Verified (PR #35)

---

# Phase 3 — Authentication

**Goal:** Implement the Auth Contract securely.

- [x] User/role model
- [x] Password hashing _(scrypt)_
- [x] PIN hashing
- [x] OTP generation
- [x] OTP hashing/storage
- [x] OTP expiry
- [x] OTP attempt limits
- [x] Farmer sign-in
- [x] Staff signup
- [x] Staff phone verification
- [x] Staff login
- [x] JWT signing _(RS256)_
- [x] Asymmetric key configuration
- [x] JWKS endpoint
- [x] Token verification
- [x] Token refresh
- [x] `/auth/me`
- [x] Account lockout
- [x] Account status handling
- [x] `AUTH_TEST_MODE`
- [x] Ensure test codes never appear in production
- [x] Staff login returns `attemptsLeft` / `retryAfterSeconds` (parity with farmer login)
- [x] Farmer suspension enforced on `/auth/refresh` (any non-approved account is refused)
- [x] Logout / token revocation and password/PIN change _(AUTH-CONTRACT updated; see Phase 17)_

**Status:** 🟢 Verified (PR #37)

---

# Phase 4 — Authorization & Access Control

**Goal:** Ensure authenticated users can only perform permitted actions.

Roles: `farmer`, `agent`, `coordinator`, `admin`

- [x] Authentication middleware
- [x] Role middleware
- [x] Agent permissions
- [x] Farmer permissions
- [x] Coordinator permissions
- [x] Admin permissions
- [x] Association scoping _(lists, `GET /farmers/:id` and photo upload)_
- [x] 403 handling
- [x] 404-forbidden-resource behaviour where required
- [x] Prevent privilege escalation
- [x] Ensure `registeredBy` comes from the token, not the PWA

**Status:** 🟢 Verified (PR #38)

---

# Phase 5 — Farmer Profile API

**Goal:** Implement the core farmer registration flow.

- [x] `POST /farmers`
- [x] Request validation
- [x] `clientId`
- [x] Phone handling
- [x] Gender
- [x] Language
- [x] Community/region
- [x] Farm size
- [x] Crops
- [x] GPS
- [x] Consent
- [x] `registeredAt`
- [x] `registeredBy`
- [x] Database transaction
- [x] Duplicate `clientId`
- [x] Duplicate phone
- [x] Correct 201/200/400/409 responses
- [x] `GET /farmers/:id`
- [x] `GET /farmers/me`
- [x] `PATCH /farmers/:id` (update) _(API-CONTRACT updated; see Phase 17)_

**Status:** 🟢 Verified (PR #39)

---

# Phase 6 — Offline Sync & Idempotency

**Goal:** Make offline-first registration reliable.

- [x] `clientId` idempotency
- [x] Safe retries
- [x] Database-level uniqueness
- [x] Transaction handling
- [x] Duplicate constraint handling
- [x] Retry-safe responses
- [x] Temporary failure behaviour
- [x] Verify repeated requests return the same server ID
- [x] Verify concurrent requests cannot create duplicates

**Status:** 🟢 Verified

---

# Phase 7 — Photo Storage

**Goal:** Implement farmer photo upload securely.

- [x] S3 bucket in `af-south-1`
- [x] Bucket security _(private, versioned, SSE-S3, scoped IAM)_
- [x] Object naming strategy _(`farmers/<id>/photo.jpg`, `crop-checks/<id>/photo.jpg`)_
- [x] `POST /farmers/:id/photo`
- [x] JPEG validation _(magic bytes; non-JPEG → 415, stored as image/jpeg)_
- [x] File-size limit _(500 KB → 413)_
- [x] Authorization _(staff token and association scope)_
- [x] Farmer ownership/permission checks _(scoped to the caller)_
- [x] S3 upload
- [x] Store object key in PostgreSQL
- [x] Handle failed uploads _(upload before DB write; no orphan cleanup)_
- [x] Prevent unauthorized object access _(private bucket; crop-check photos served through the API)_

**Status:** 🟢 Verified (PR #44)

---

# Phase 8 — Rate Limiting & Abuse Protection

**Goal:** Protect production endpoints.

- [x] Global rate limiting strategy _(per-IP, 300/min)_
- [x] Authentication-specific limits _(20/min on the sign-in and sign-up routes)_
- [x] OTP limits _(3 codes / phone / 15 min, DB-backed)_
- [x] Login limits _(account lockout + per-IP limiter)_
- [x] PIN lockout
- [x] IP-based controls where appropriate
- [x] Phone/account-based controls where appropriate
- [x] 429 responses
- [x] Retry behaviour _(Retry-After header)_
- [x] Avoid blocking legitimate offline sync _(global limit is well above a sync batch)_

**Status:** 🟢 Verified (PR #41)

---

# Phase 9 — Admin & Coordinator API

**Goal:** Build the administrative backend.

- [x] `/admin/stats`
- [x] `/admin/income`
- [x] Farmer listing
- [x] Farmer details _(`GET /admin/farmers/:id` — record plus payments, scoped)_
- [x] Agent listing
- [x] Agent approval
- [x] Agent rejection
- [x] Agent suspension
- [x] Agent reinstatement
- [x] Coordinator creation
- [x] Association scoping
- [x] CSV farmer export
- [x] CSV payment export
- [x] Heartbeat
- [x] Correct admin/coordinator permissions

**Status:** 🟢 Verified (PR #43)

---

# Phase 10 — Pagination, Filtering & Query Performance

**Goal:** Make list endpoints production-safe.

- [x] Define pagination convention _(?page=&pageSize=, capped, `{ items, total }`)_
- [x] Default page size _(50)_
- [x] Maximum page size _(100)_
- [x] Sorting _(allow-listed `sort`/`dir`)_
- [x] Farmer search
- [x] Community filtering
- [x] Crop filtering
- [x] Agent status filtering
- [x] Audit pagination _(page + `total`)_
- [x] Database indexes _(Phase 2)_
- [~] Query performance testing _(indexes added; no load test yet)_
- [x] Avoid unbounded queries _(every list endpoint is paged)_

**Status:** 🟢 Verified (PR #47)

---

# Phase 11 — Feedback API

**Goal:** Implement offline-safe feedback.

- [x] `POST /feedback`
- [x] Validation
- [x] Rating validation
- [x] `clientId` idempotency
- [x] Authentication
- [x] Role handling
- [x] Database storage
- [x] Audit requirements _(audit trigger on feedback, actor set)_
- [x] Duplicate submission testing

**Status:** 🟢 Verified (PR #48)

---

# Phase 12 — Audit & Observability

**Goal:** Know what happened when something goes wrong.

- [x] Database audit triggers
- [x] Application actor
- [x] Authentication events _(structured sign-in success/failure, lockout, refresh refusal)_
- [x] Failed-login audit
- [x] Admin actions
- [x] Export events
- [x] Structured logs _(pino JSON)_
- [x] Request IDs _(`X-Request-Id`)_
- [x] Error IDs
- [x] Log levels _(`LOG_LEVEL`)_
- [x] Production log policy _(documented in backend/README)_
- [x] Sensitive-data protection
- [x] Monitoring _(CloudWatch log group + dashboard)_
- [x] Alerts _(8 CloudWatch alarms + SNS + budget)_

**Status:** 🟢 Verified (PR #49)

---

# Phase 13 — AWS Infrastructure

**Goal:** Put production infrastructure in the correct AWS region.

**Target:** `af-south-1` (Africa/Cape Town). Resources were initially created in `eu-west-1`.

- [x] Audit existing `eu-west-1` resources
- [x] RDS migration/recreation
- [x] S3 migration/recreation
- [x] Security groups
- [x] IAM roles/policies
- [x] Secrets
- [x] Network configuration
- [x] Environment variables
- [x] Backups
- [x] Encryption
- [x] Remove/retire incorrect EU resources only after verification _(nothing live in EU except the intentional Amplify alias)_
- [x] Confirm AWS billing/budget protection

**Status:** 🟢 Verified (stale `docs/` corrected in PR #51)

---

# Phase 14 — Production Deployment

**Goal:** Deploy the API safely.

- [x] Deployment architecture confirmed
- [x] Production environment
- [x] Environment variables/secrets
- [x] HTTPS
- [x] `api.agroconnect.space`
- [x] Database connectivity
- [x] S3 connectivity
- [x] Health check
- [x] Readiness check _(`GET /ready`)_
- [x] CORS production origin
- [x] Logging
- [x] Deployment rollback _(SSM-pinned image tag, PR #27)_
- [x] Smoke test _(CI image boot + post-deploy probe in deploy.yml)_

**Status:** 🟢 Verified (PR #52)

---

# Phase 15 — Testing & Production Readiness

**Goal:** Do not call this production until the critical paths are verified.

- [x] Unit tests _(helper units: validation, time, CSV)_
- [x] Integration tests
- [x] Authentication tests
- [x] Authorization tests
- [x] Farmer registration tests
- [x] Duplicate tests
- [~] Offline retry tests _(server side covered; frontend queue tested in the PWA)_
- [x] Photo tests
- [x] Rate-limit tests
- [x] Pagination tests
- [x] Admin tests
- [x] Audit tests
- [~] Security tests _(CORS, webhook HMAC, audit redaction, CSV injection; SQLi/XSS/brute-force left)_
- [x] Database migration test
- [x] Backup/restore test _(`scripts/verify-backup-restore.sh`, green on Postgres 16)_
- [x] Production smoke test _(post-deploy probe in deploy.yml)_
- [~] Frontend integration test _(PWA unit + mock-contract tests; no shipped-PWA ↔ shipped-API e2e)_

**Status:** 🟢 Verified (PR #54)

---

# Phase 16 — Post-plan features (added after this tracker was drafted)

Four features merged onto `main` after the phase list above was written. The original tracker did not
cover them; they are recorded here so the tracker stays the single source of truth. All are 🟢 and
covered by tests.

| Feature | Status | PR | Migration |
|---|---|---|---|
| Farmer profile extension | 🟢 | #46 | `004_farmer_profile.sql` |
| USSD access for feature phones | 🟢 | #50 | `005_ussd_and_support_requests.sql` |
| Extension visit log | 🟢 | #53 | `006_extension_visits.sql` |
| Push notifications | 🟢 | #58 | `007_push_subscriptions.sql` |

## 16a — Farmer profile extension (🟢 #46)

Optional farmer attributes the Prosit brief asks for: farm/soil, seasons, technology access, financial
profile, and extension history/needs. Every field is optional, so records created before the migration
stay valid.

- **Schema:** adds columns to `farmers` (no new table) — `soil_type`, `seasons[]`, `phone_type`,
  `data_plan`, `contact_channel`, `income_sources[]`, `has_bank_account`, `mobile_money_use`, `needs[]`,
  `last_extension_visit`.
- **API:** `POST /farmers` takes an optional `profile` object; `GET /farmers/:id` and `GET /farmers/me`
  return it; `GET /admin/stats` adds `byPhoneType`, `byContactChannel`, `byMobileMoney`, `byNeed`,
  `bySoilType`, `byExtensionVisit` and `bankAccount`; the farmers CSV appends the ten fields.
- **Code:** `backend/src/profile.ts` (one spec drives validation, the INSERT, the view and the CSV),
  wired through `routes/farmers.ts` and `routes/admin.ts`.
- **Tests:** `backend/test/profile.test.mjs`.

## 16b — USSD access for feature phones (🟢 #50)

A farmer on a basic phone, with no app and no data, dials our USSD code (e.g. `*928*77#`) and uses a text
menu. The telco sends every key press to `POST /ussd`; our text reply is the next screen.

- **How a session works:** each key press is a separate request carrying `sessionID`, `msisdn` and only
  the latest `userData`. The menu position is kept in `ussd_sessions` (`state` JSONB) between requests,
  and deleted when the session ends; stale rows are cleaned after 24h. There is no token — the caller is
  whoever the gateway says owns the phone number.
- **Gate:** the route answers **404** unless `USSD_USER_ID` is set, and **403** for a request whose
  `userID` is not ours.
- **Menu:** language first (English / Twi / Ewe, or the language on the farmer's record), then
  `1` market prices · `2` farming advice · `3` my registration · `4` ask for an agent visit ·
  `5` today's weather · `0` exit.
  - Prices come from `market_prices` with the week-on-week change; advice from `advice_cards`;
    registration reads the caller's `farmers` row by phone; weather is Open-Meteo for the farm's GPS
    (3s timeout, and a friendly message when it is unavailable or the farm has no GPS).
- **Agent-visit requests** are stored in `support_requests` (`channel='ussd'`, `kind='agent_visit'`) and
  worked with `GET /admin/requests` (admin/coordinator; scoped — admins see all, a coordinator their
  association's farmers and unregistered callers) and `POST /admin/requests/:id/done`.
- **Text:** `backend/src/ussdText.ts` holds the screens in the three languages (about 160 characters per
  screen); Twi and Ewe follow the PWA translations and still need a native-speaker review.
- **Config:** `USSD_USER_ID` (Arkesel's account id for our code).
- **Tests:** `backend/test/ussd.test.mjs` — off by default; wrong gateway 403; language flow; registration
  read-out; prices with the weekly change; advice list and read; a visit request created and closed by a
  coordinator; weather; invalid key repeats the menu and `0` exits.

## 16c — Extension visit log (🟢 #53)

Field agents record each visit to a farmer — the topics discussed, notes and the next visit — queued on
the phone and synced later.

- **Schema:** `extension_visits` — `client_id` unique (offline idempotency), `farmer_id`, `agent_id`,
  `visited_at`, `topics[]` (`advice|inputs|pests|market|training|credit|records|follow_up`), `notes`
  (≤500), `next_visit`, plus audit and touch triggers.
- **API:** `POST /farmers/:id/visits` and `GET /farmers/:id/visits` (agent/coordinator; admin may read
  but not write), scoped like the farmer record. A repeated `clientId` returns 200 with the same row.
- **Code:** `backend/src/routes/farmers.ts`.
- **Tests:** `backend/test/visits.test.mjs`.

## 16d — Push notifications (🟢 #58)

Web Push so users hear about an event with the app closed: a crop check answered, a payment settled, new
advice, or an agent approved. Best-effort — a failed push never fails the request, and a subscription the
push service reports gone (404/410) is deleted.

- **Schema:** `push_subscriptions` (`endpoint` primary key, `user_id`, `p256dh`, `auth`, `last_used_at`).
- **API:** `GET /push/key` (public; 404 when push is off), `POST /push/subscriptions` (any signed-in
  user; upserts by endpoint), `POST /push/subscriptions/delete` (removes the caller's endpoint).
- **Delivery:** `backend/src/push.ts` (`web-push`, 24h TTL, 5s timeout) with localized copy
  (`en|tw|ee`), triggered from the agent-approve, crop-check advice, new-advice and votex365 webhook
  paths.
- **Config:** `VAPID_SECRET_ARN` — `{ public_key, private_key, subject }`. Unset: push off.
- **Tests:** `backend/test/push.test.mjs`.

---

# Phase 17 — Session revocation, credential change and farmer editing

The two items that were parked as "needs a contract decision" are now implemented end to end,
contract-first.

| Work | PR | What |
|---|---|---|
| Contracts + mock server | #67 | AUTH/API contracts and the mock: `ver`/`token_version` revocation, `POST /auth/logout`, `/auth/staff/password`, `/auth/farmer/pin`, `PATCH /farmers/:id` |
| Backend auth | #70 | `users.token_version` (migration `008`), a per-request `resolveSession` guard, and the three auth routes |
| Backend farmer editing | #71 | `PATCH /farmers/:id` (scoped; phone/`clientId` immutable; `crops` replaced; audited) |
| PWA auth | #73 | server logout, forced sign-out on revocation/suspension, Change password (Settings) and Change PIN (Me) |
| PWA farmer editing | #74 | an edit form on the farmer detail; edits sync as a `PATCH` |

**What changed**

- **Revocation is immediate.** Every token carries a `ver` claim; each request compares it with the
  account's `token_version`, so a logout, a password/PIN change or an admin suspension cuts the phone off
  on its **next request** — not at the next refresh. This also closes the old "a suspended agent keeps
  working until the token expires" gap.
- **Credential change** (staff password, farmer PIN) re-hashes the secret, bumps the version and returns a
  fresh token, so the current device stays signed in while the user's other sessions end.
- **Farmer editing** lets staff fix a record they can see (name, community, region, language, gender, farm
  size, crops, GPS, consent, profile). The phone is immutable because it links the login account. An edit
  made offline waits as an `edited` record and is patched on the next sync (last-write-wins).
- **Documented:** the `ver` claim and `token_version` in AUTH-CONTRACT; `PATCH /farmers/:id` in API-CONTRACT.

**Still open (optional):** the per-request account lookup could be cached under load, and logout ends all of
a user's sessions rather than one device (see AUTH-CONTRACT).

---

# Remaining work (optional / needs a decision)

All phases above — including **16** and **17** — are implemented and verified against `main`. What is left
is optional hardening or work that arrived after this tracker was written, not a gap in the plan.

## Optional (no contract change)

- **Query performance / load test** (Phase 10) — indexes and bounded, paged queries are in; a load test
  under realistic volume is not.
- **Deeper security tests** (Phase 15) — CORS, webhook HMAC, audit redaction and CSV injection are
  covered; there are no SQL-injection, XSS or brute-force tests.
- **Backend-driven offline-retry test** — the server half (a repeat returns 200 with the same id; a 503
  keeps work queued) is covered; the phone-side retry loop is tested in the PWA, not end to end.
- **Shipped-PWA ↔ shipped-API e2e** — the PWA runs unit and mock-contract tests; nothing drives the real
  PWA against the real API.

## Decisions now made

Both former decisions are implemented in **Phase 17** above: session revocation / logout / password-PIN
change, and `PATCH /farmers/:id`.

## Added after this tracker was written

Now recorded in **Phase 16** above: farmer profile extension (#46), USSD access for feature phones
(#50), extension visit log (#53) and push notifications (#58).

## Housekeeping

- Two migrations share the `004_` prefix — `004_farmer_profile.sql` and `004_feedback_audit.sql`. The
  runner keys on the full filename, so both apply in name order; only the numbering is duplicated
  (cosmetic, and forward-only to change).

---

# Current Working Rule

We work **one phase at a time and one step at a time**, per phase in this tracker.

For each step:

1. Explain what we are doing.
2. Give the exact action.
3. Perform it.
4. Show the result.
5. Verify it.
6. Only then mark it **🟢 Verified**.
7. If anything is unclear, stop and clarify before proceeding.

Each phase ships through GitOps: branch → PR → CI (frontend, backend, terraform) → Code Owner
review → squash merge → deploy. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).

**No assumptions. No invented existing architecture. No marking work complete without verification.**
