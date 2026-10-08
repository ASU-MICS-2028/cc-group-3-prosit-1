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
| 0 — Requirements & Architecture Baseline | 🟡 | Contracts + ADRs recorded; pagination and rate-limit conventions still open |
| 1 — Backend Project Foundation | 🟡 | App/errors/CORS/health done; headers, structured logs, request IDs, `/ready`, `.env.example` left |
| 2 — Database & Migration | 🟡 | Schema + triggers + migration runner done; extra indexes, delete policy, rollback strategy left |
| 3 — Authentication | 🟢 | Full RS256 auth, OTP, PIN, lockout, JWKS, test mode; two minor decisions open (🔴) |
| 4 — Authorization & Access Control | 🟡 | Role gates done; per-association scoping of `GET /farmers/:id` + photo left |
| 5 — Farmer Profile API | 🟡 | Registration + read done; in-route enum validation left |
| 6 — Offline Sync & Idempotency | 🟢 | `client_id NOT NULL UNIQUE` insert-and-catch everywhere, concurrency tested |
| 7 — Photo Storage | 🟡 | S3 + size limits done; JPEG content validation + ownership scoping left |
| 8 — Rate Limiting & Abuse Protection | 🟡 | OTP + account lockout done; global/IP limits left |
| 9 — Admin & Coordinator API | 🟡 | Whole surface done except `GET /admin/farmers/:id` |
| 10 — Pagination, Filtering & Query Performance | 🟡 | Farmers + audit paginate (in memory); uniform pagination/sorting left |
| 11 — Feedback API | 🟡 | Endpoint done; audit trail left |
| 12 — Audit & Observability | 🟡 | DB audit + CloudWatch done; structured logs, request/error IDs, log levels left |
| 13 — AWS Infrastructure | 🟢 | Everything live is `af-south-1`; only Amplify stays `eu-west-1` (ADR-009). Some docs stale |
| 14 — Production Deployment | 🟡 | HTTPS, domain, rollback, OIDC deploy done; `/ready` and post-deploy smoke left |
| 15 — Testing & Production Readiness | 🟡 | Strong integration tests; unit, pagination, rate-limit, backup/restore left |

---

# Phase 0 — Requirements & Architecture Baseline

**Goal:** Establish exactly what we are building before changing production code.

- [x] Confirm backend repository structure
- [x] Confirm whether `auth-service` is separate or part of the Express API _(one service — ADR-013)_
- [x] Confirm current PostgreSQL implementation
- [x] Confirm AWS deployment architecture
- [x] Confirm authentication implementation
- [x] Resolve API phone-field decision _(split `country_code` + `phone_national`, generated `phone_e164`)_
- [ ] Define pagination convention _(Phase 10)_
- [ ] Define general rate-limit policy _(Phase 8)_
- [x] Resolve contract inconsistencies _(DATA/API/AUTH/ADMIN/ADVICE/LISTINGS/PAYMENTS contracts)_
- [x] Record final architecture decisions _(ADRs 001–013)_

**Status:** 🟡 In progress

---

# Phase 1 — Backend Project Foundation

**Goal:** Establish a clean production Express foundation.

- [x] Node.js/Express application structure
- [x] Environment configuration
- [ ] `.env.example`
- [~] Configuration validation _(loads config; fail-fast validation left)_
- [x] Centralized error-handling middleware
- [x] 404/not-found handling
- [x] Request validation middleware _(per-route; no shared schema library)_
- [ ] Security headers
- [x] CORS configuration
- [x] Request/body size limits
- [ ] Structured logging
- [ ] Request/correlation ID
- [~] Graceful shutdown _(SIGTERM only; SIGINT + force-exit timeout left)_
- [x] `/health`
- [ ] `/ready` or readiness check
- [x] Production error responses _(error IDs left)_
- [x] Ensure sensitive information is not exposed in errors/logs

**Status:** 🟡 In progress

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
- [~] Required indexes _(only `farmers_created_by_idx`, `payments_farmer_idx`; more left)_
- [x] Foreign keys
- [~] Delete/update behaviour _(only two `ON DELETE CASCADE`; explicit policy left)_
- [x] Database migration testing
- [ ] Rollback strategy

**Status:** 🟡 In progress

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
- [ ] Staff login returns `attemptsLeft` / `retryAfterSeconds` (parity with farmer login)
- 🔴 Decision: farmer suspension on `/auth/refresh` (staff are blocked, farmers are not)
- 🔴 Decision: logout / token revocation and PIN/password change — **not in AUTH-CONTRACT**

**Status:** 🟢 Verified (two open decisions above)

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
- [~] Association scoping _(lists scoped; `GET /farmers/:id` and photo upload are not)_
- [x] 403 handling
- [x] 404-forbidden-resource behaviour where required
- [x] Prevent privilege escalation
- [x] Ensure `registeredBy` comes from the token, not the PWA

**Status:** 🟡 In progress

---

# Phase 5 — Farmer Profile API

**Goal:** Implement the core farmer registration flow.

- [x] `POST /farmers`
- [x] Request validation
- [x] `clientId`
- [x] Phone handling
- [~] Gender _(stored + DB CHECK; in-route validation left)_
- [~] Language _(stored + DB CHECK; in-route validation left)_
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
- 🔴 Decision: `PATCH /farmers/:id` (update) is **not in API-CONTRACT**

**Status:** 🟡 In progress

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
- [ ] JPEG validation _(accepts any bytes with an `image/jpeg` label)_
- [x] File-size limit _(500 KB → 413)_
- [~] Authorization _(requires staff token; association scope left)_
- [~] Farmer ownership/permission checks _(not scoped to the caller's association)_
- [x] S3 upload
- [x] Store object key in PostgreSQL
- [x] Handle failed uploads _(upload before DB write; no orphan cleanup)_
- [x] Prevent unauthorized object access _(private bucket; crop-check photos served through the API)_

**Status:** 🟡 In progress

---

# Phase 8 — Rate Limiting & Abuse Protection

**Goal:** Protect production endpoints.

- [ ] Global rate limiting strategy
- [~] Authentication-specific limits
- [x] OTP limits _(3 codes / phone / 15 min, DB-backed)_
- [~] Login limits _(per-account lockout only, no per-IP)_
- [x] PIN lockout
- [ ] IP-based controls where appropriate
- [x] Phone/account-based controls where appropriate
- [x] 429 responses
- [~] Retry behaviour
- [ ] Avoid blocking legitimate offline sync

**Status:** 🟡 In progress

---

# Phase 9 — Admin & Coordinator API

**Goal:** Build the administrative backend.

- [x] `/admin/stats`
- [x] `/admin/income`
- [x] Farmer listing
- [ ] Farmer details _(`GET /admin/farmers/:id` — ADMIN-CONTRACT §86-87)_
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

**Status:** 🟡 In progress

---

# Phase 10 — Pagination, Filtering & Query Performance

**Goal:** Make list endpoints production-safe.

- [~] Define pagination convention _(page-based; not uniform)_
- [~] Default page size _(`PAGE_SIZE = 100`, hard-coded)_
- [ ] Maximum page size
- [ ] Sorting
- [x] Farmer search
- [x] Community filtering
- [x] Crop filtering
- [x] Agent status filtering
- [~] Audit pagination _(page only, no `total`)_
- [~] Database indexes _(Phase 2)_
- [ ] Query performance testing
- [ ] Avoid unbounded queries _(agents, coordinators, activity, listings, crop-checks, payments unbounded)_

**Status:** 🟡 In progress

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
- [ ] Audit requirements
- [x] Duplicate submission testing

**Status:** 🟡 In progress

---

# Phase 12 — Audit & Observability

**Goal:** Know what happened when something goes wrong.

- [x] Database audit triggers
- [x] Application actor
- [~] Authentication events _(lockout/refresh exist; no structured auth event log)_
- [x] Failed-login audit
- [x] Admin actions
- [x] Export events
- [ ] Structured logs
- [ ] Request IDs
- [ ] Error IDs
- [ ] Log levels
- [~] Production log policy
- [x] Sensitive-data protection
- [x] Monitoring _(CloudWatch log group + dashboard)_
- [x] Alerts _(8 CloudWatch alarms + SNS + budget)_

**Status:** 🟡 In progress

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

**Status:** 🟢 Verified (some `docs/` still describe the old region — fix in Phase 13 docs PR)

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
- [ ] Readiness check
- [x] CORS production origin
- [x] Logging
- [x] Deployment rollback _(SSM-pinned image tag, PR #27)_
- [~] Smoke test _(CI image boot; post-deploy probe left)_

**Status:** 🟡 In progress

---

# Phase 15 — Testing & Production Readiness

**Goal:** Do not call this production until the critical paths are verified.

- [ ] Unit tests _(integration exists; no backend unit tests)_
- [x] Integration tests
- [x] Authentication tests
- [x] Authorization tests
- [x] Farmer registration tests
- [x] Duplicate tests
- [~] Offline retry tests _(server side covered; frontend queue tested in the PWA)_
- [x] Photo tests
- [~] Rate-limit tests _(OTP + lockout covered; global limiter not yet)_
- [ ] Pagination tests
- [x] Admin tests
- [x] Audit tests
- [~] Security tests _(CORS, webhook HMAC, audit redaction, CSV injection; SQLi/XSS/brute-force left)_
- [x] Database migration test
- [ ] Backup/restore test
- [~] Production smoke test _(image boot in CI; no post-deploy probe)_
- [~] Frontend integration test _(PWA unit + mock-contract tests; no shipped-PWA ↔ shipped-API e2e)_

**Status:** 🟡 In progress

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
