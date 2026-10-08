# API Tier — Containerized Application Backend

**Lead:** Elise Kennedy-Angbo ([@Elise-Oyi](https://github.com/Elise-Oyi))  
**Production Endpoint:** [`https://api.agroconnect.space`](https://api.agroconnect.space)  
**Hosting Infrastructure:** AWS EC2 Auto Scaling Group (`af-south-1` Cape Town) behind ALB  
**Associated Architectural Records:** [ADR-003 (Stateless Compute)](./architecture-decisions.md#adr-003-stateless-containerized-application-tier-on-auto-scaled-compute), [ADR-006 (HTTPS via ACM)](./architecture-decisions.md#adr-006-https-via-aws-certificate-manager-with-external-dns-hostinger), [ADR-008 (Target-Tracking Scaling)](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget), [ADR-011 (Node.js/TypeScript Runtime)](./architecture-decisions.md#adr-011-backend-runtime-migration-to-nodejs-and-typescript), [ADR-013 (One Service, Postgres, votex365)](./architecture-decisions.md#adr-013-one-backend-service-for-every-contract-on-postgres)

---

## 1. Role & Architectural Responsibilities

The API tier is the single backend the PWA talks to. One Node.js service, `agroconnect-api`, implements all six contracts the PWA was built against ([`frontend/agroconnect-pwa/docs/`](../frontend/agroconnect-pwa/docs)): farmer registration, sign-in for all four roles, the admin dashboard, payments, crop checks and produce listings.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AWS Application Load Balancer (ALB)                  │
│   :443 (ACM TLS for api.agroconnect.space), :80 → 301 to :443          │
│   Health probe: GET /health every 15s                                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP :8000
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│     Private app subnets: Auto Scaling Group (af-south-1a / 1b)         │
│   EC2 t3.micro → Docker → Node.js 24 / Express 5 (USER node)           │
│     /auth/*  /farmers*  /admin/*  /payments*  /crop-checks*  /listings │
└──────┬──────────────────┬───────────────────┬────────────────┬─────────┘
       │ TLS (verified)   │ instance role     │ HTTPS          │ HTTPS
       ▼                  ▼                   ▼                ▼
  RDS Postgres 16    S3 media bucket     Arkesel SMS      votex365 checkout
  (data subnets)     Secrets Manager                      (+ signed webhook)
```

### Core Design Goals
1. **Stateless:** instances keep nothing between requests. Accounts, sign-in codes, lockouts and payments live in Postgres; photos in S3. Any instance can serve any request.
2. **Safe for an offline-first client:** everything a phone creates carries a `clientId` UUID. The database enforces uniqueness, so a retried send is answered with the original record (200), never a duplicate.
3. **Contract-tested:** the PWA's mock server is the executable reference; its contract tests are ported into `backend/test/` and run against this service on Postgres in CI.
4. **Least privilege:** unprivileged container user, private subnets, no SSH, and an instance role that can read exactly the app's five secrets and write only its own S3 bucket.

---

## 2. Technology Stack & Implementation

* **Runtime:** Node.js 24 LTS, **Express 5**, **TypeScript** (`NodeNext`, ES2022)
* **Database driver:** `pg` with a pool; schema migrations in [`backend/migrations/`](../backend/migrations), applied on boot
* **Tokens:** `jose` (RS256)
* **AWS:** `@aws-sdk/client-s3`, `@aws-sdk/client-secrets-manager` (credentials from the instance role through IMDSv2)
* **Source:** [`backend/src/`](../backend/src): `routes/` per contract, `db.ts`, `migrate.ts`, `security.ts`, `integrations.ts` (Arkesel, S3, votex365)
* **Tests:** Vitest on PGlite (Postgres in WebAssembly) or a real Postgres (`TEST_DATABASE_URL`)

---

## 3. API Surface

Every endpoint except `/health`, `/`, `/.well-known/jwks.json`, the sign-in calls and the votex365 webhook needs `Authorization: Bearer <token>`. The contracts are the specification; this table is the map.

| Area | Endpoints | Roles | Contract |
|---|---|---|---|
| Farmers | `POST /farmers`, `POST /farmers/:id/photo`, `GET /farmers/:id` | agent, coordinator (+ admin for GET) | [API](../frontend/agroconnect-pwa/docs/API-CONTRACT.md) |
| | `GET /farmers/me` | farmer | |
| Sign-in | `POST /auth/farmer/{start,verify-otp,login}` | public | [AUTH](../frontend/agroconnect-pwa/docs/AUTH-CONTRACT.md) |
| | `POST /auth/staff/{signup,verify-phone,login}` | public | |
| | `POST /auth/refresh`, `GET /auth/me`, `GET /.well-known/jwks.json` | any | |
| Admin | `/admin/stats`, `/admin/agents/*`, `/admin/coordinators/*`, `/admin/farmers`, `/admin/audit`, `/admin/activity`, `/admin/export/*.csv` | admin, coordinator (scoped) | [ADMIN](../frontend/agroconnect-pwa/docs/ADMIN-CONTRACT.md) |
| | `POST /agents/me/heartbeat`, `POST /feedback` | staff / any | |
| Payments | `POST /payments`, `GET /payments/me`, `GET /payments/:id`, `GET /farmers/:id/payments`, `POST /loan-requests`, `GET /admin/income` | farmer / staff (scoped) | [PAYMENTS](../frontend/agroconnect-pwa/docs/PAYMENTS-CONTRACT.md) |
| | `POST /webhooks/votex365` | votex365 (signed) | |
| Advice | `POST /crop-checks`, `POST /crop-checks/:id/photo`, `GET /crop-checks/me`, `GET /crop-checks`, `GET /crop-checks/:id/photo`, `POST /crop-checks/:id/advice` | farmer / field staff | [ADVICE](../frontend/agroconnect-pwa/docs/ADVICE-CONTRACT.md) |
| Listings | `POST /listings`, `GET /listings`, `POST /listings/:id/close` | farmer / any | [LISTINGS](../frontend/agroconnect-pwa/docs/LISTINGS-CONTRACT.md) |
| Ops | `GET /health`, `GET /` | public | |

### Example: `POST /farmers`

```http
POST /farmers
Authorization: Bearer <agent token>
Content-Type: application/json

{ "clientId": "0b9c6f0e-5a8f-4a43-9a7e-3a4d1b2c3d4e", "name": "Ama Mensah",
  "countryCode": "+233", "phoneNational": "241234567", "preferredLanguage": "tw",
  "gender": "female", "community": "Ashaiman", "region": "Greater Accra",
  "farmSizeAcres": 2.5, "crops": ["maize", "tomato"],
  "gps": { "lat": 5.6941, "lng": -0.0332, "accuracy": 8, "capturedAt": "2026-10-07T08:59:00Z" },
  "consent": true, "registeredAt": "2026-10-07T09:00:00Z" }
```

| Status | Meaning |
|---|---|
| `201 { "id": "42" }` | New farmer |
| `200 { "id": "42" }` | The same `clientId` again (a phone retrying): the original record |
| `409 duplicate_phone` | A different farmer with the same phone number |
| `400 invalid_request` | Missing field, or a value outside the allowed lists |
| `401` / `403` | No valid token / wrong role |

Every error body is `{ "error": "<code>", "message": "<readable text>" }`.

---

## 4. Behaviour Worth Knowing

* **Idempotency without races:** the service inserts and maps Postgres error `23505` by constraint name (`…_client_id_key` → 200, `farmers_phone_e164_key` → 409). It never searches first, so two simultaneous sends cannot both insert.
* **Audit:** a database trigger records every change with the acting user from the token (`set_config('app.actor', $1, true)`); PIN and password hashes are stripped. See [data-tier.md §4](./data-tier.md#4-audit-trail).
* **Sign-in codes:** 6 digits, hashed, 5 minutes, 5 attempts, 3 per phone per 15 minutes, texted by Arkesel. If the SMS fails, the code and the rate-limit slot are not spent. `AUTH_TEST_MODE=true` returns the code instead (demo only).
* **Lockouts:** 5 wrong PINs or passwords lock the account for 15 minutes, on the server.
* **Payments:** cedi collections open a votex365 hosted checkout (test keys); the PWA shows a *Complete payment* button. A signed webhook (HMAC-SHA256 over the raw body, 5-minute window) settles the payment, with a status check against votex365 as a fallback when the phone polls. Payouts, NGN and KES, which votex365 cannot do, are simulated as the test-mode contract describes.
* **CORS:** only `https://app.agroconnect.space` (`PWA_ORIGINS`) may call from a browser, with `Authorization` and `Content-Type`.

---

## 5. Container & Runtime Configuration

The two-stage Alpine image ([`backend/Dockerfile`](../backend/Dockerfile)) ships the compiled `dist/`, production dependencies, the `migrations/` folder and the af-south-1 RDS CA bundle (`DB_CA_FILE`), and runs as `USER node`. CI pushes `:latest` and `:<sha>` to ECR (`agroconnect-dev-backend`).

EC2 user data starts the container with **ARNs and settings only**; the app reads secret values itself at runtime, so nothing sensitive sits in user data or `docker inspect`:

| Variable | Source |
|---|---|
| `DB_HOST`, `DB_NAME`, `DB_SECRET_ARN` | RDS endpoint and its managed master secret (password fetched per connection, so rotation needs no restart) |
| `JWT_SECRET_ARN` | Token-signing key `{ private_key_pem }` |
| `SMS_SECRET_ARN` | Arkesel `{ api_key, sender_id }` |
| `VOTEX_SECRET_ARN` | votex365 `{ api_key, webhook_secret }` |
| `ADMIN_SEED_SECRET_ARN` | First admin account, created if missing |
| `PHOTO_BUCKET` | S3 media bucket |
| `PWA_ORIGINS`, `PAYMENT_RETURN_URL` | Derived from the frontend domain |
| `AUTH_TEST_MODE`, `SEED_DEMO_ACCOUNTS` | Terraform variables, default `false` |

Logs go to CloudWatch (`/agroconnect-dev/app`) through Docker's `awslogs` driver: one line per request with method, path, status and duration, never bodies.

---

## 6. Load Balancing & Network Security

* **Listeners:** `:80` returns 301 to HTTPS; `:443` terminates TLS with an ACM certificate for `api.agroconnect.space`.
* **Target group:** `HTTP:8000`, health check `GET /health` every 15 s, timeout 5 s, healthy after 2 successes, unhealthy after 5 failures.
* **Security groups:** Internet → ALB SG (443) → App SG (8000) → Data SG (5432). Nothing reaches the instances or the database directly.
* **Boot order:** a new instance migrates the database (advisory lock) before it listens, so it only passes the health check once the schema is current.

---

## 7. Auto Scaling & Demand Management

Scaling follows **`ALBRequestCountPerTarget`** ([ADR-008](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget)): target 500 requests per instance per minute, between 1 and 3 instances (desired 1). The service is I/O-bound (Postgres, S3, SMS, votex365), so request count is a better signal than CPU.

---

## 8. Local Development & Testing

```bash
cd backend && npm ci
# Any Postgres 16+; for example: docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
  AUTH_TEST_MODE=true SEED_DEMO_ACCOUNTS=true npm run dev     # http://localhost:8000

npm test                                                     # 108 tests on PGlite, no setup
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test   # on real Postgres
```

Point the PWA at it with `VITE_API_URL=http://localhost:8000`. Full variable list: [`backend/README.md`](../backend/README.md#configuration).
