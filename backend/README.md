# AgroConnect Backend — `agroconnect-api`

**Lead:** Elise Kennedy-Angbo ([@Elise-Oyi](https://github.com/Elise-Oyi))  
**Production endpoint:** [`https://api.agroconnect.space`](https://api.agroconnect.space)  
**Hosting:** EC2 Auto Scaling Group in `af-south-1` behind an ALB, Postgres 16 on RDS, photos in S3  
**Decisions:** [ADR-003](../docs/architecture-decisions.md#adr-003-stateless-containerized-application-tier-on-auto-scaled-compute), [ADR-006](../docs/architecture-decisions.md#adr-006-https-via-aws-certificate-manager-with-external-dns-hostinger), [ADR-011](../docs/architecture-decisions.md#adr-011-backend-runtime-migration-to-nodejs-and-typescript)

## What it is

One Node.js 24 / Express 5 / TypeScript service that implements every contract the PWA is built against:

| Contract | Endpoints |
|---|---|
| [API](../frontend/agroconnect-pwa/docs/API-CONTRACT.md) | `POST /farmers`, `POST /farmers/:id/photo`, `GET /farmers/me`, `GET /farmers/:id`, `GET /health` |
| [AUTH](../frontend/agroconnect-pwa/docs/AUTH-CONTRACT.md) | `/auth/farmer/{start,verify-otp,login}`, `/auth/staff/{signup,verify-phone,login}`, `/auth/refresh`, `/auth/me`, `/.well-known/jwks.json` |
| [ADMIN](../frontend/agroconnect-pwa/docs/ADMIN-CONTRACT.md) | `/admin/{stats,agents,coordinators,farmers,audit,activity,export/*.csv}`, `/agents/me/heartbeat`, `/feedback` |
| [PAYMENTS](../frontend/agroconnect-pwa/docs/PAYMENTS-CONTRACT.md) | `/payments`, `/payments/me`, `/payments/:id`, `/farmers/:id/payments`, `/loan-requests`, `/admin/income`, `/webhooks/votex365` |
| [ADVICE](../frontend/agroconnect-pwa/docs/ADVICE-CONTRACT.md) | `/crop-checks`, `/crop-checks/me`, `/crop-checks/:id/{photo,advice}` |
| [LISTINGS](../frontend/agroconnect-pwa/docs/LISTINGS-CONTRACT.md) | `/listings`, `/listings/:id/close` |
| [CONTENT](../frontend/agroconnect-pwa/docs/CONTENT-CONTRACT.md) | `GET /market-prices`, `GET /advice`, `POST /admin/market-prices`, `POST /admin/advice`, `/admin/advice/:id/archive` |

The PWA's mock server (`frontend/agroconnect-pwa/mock-server/`) is the executable reference: its contract tests are ported into `test/` and run against this service.

## How it works

- **Database:** the schema is in [`migrations/`](migrations), applied on boot under an advisory lock ([`db/README.md`](../db/README.md)). Idempotency is enforced by `client_id UUID NOT NULL UNIQUE` constraints: the service inserts and maps SQLSTATE `23505` by constraint name to 200 (a repeat) or 409 (a clash), never searching first.
- **Audit:** a trigger writes every change to `users`, `farmers`, `farmer_crops`, `payments`, loan requests, crop checks, listings and `feedback` into `audit_log`, with the acting user from the token's `sub` (set per transaction with `set_config('app.actor', $1, true)`). PIN and password hashes never reach the log.
- **Logging & health:** structured JSON on stdout (pino) into CloudWatch, one line per request carrying the `X-Request-Id`; an unexpected error logs an `errorId` and returns it. Authorization headers and cookies are redacted and request bodies are never logged. Failed sign-ins, lockouts and refused refreshes are logged with the actor id — never a phone number, code, PIN or password. `GET /health` is liveness and `GET /ready` checks the database.
- **Auth:** RS256 JWTs. The private key is in Secrets Manager (`JWT_SECRET_ARN`), so every instance signs with the same key; the public key is at `/.well-known/jwks.json`. PINs and passwords are hashed with scrypt; 5 wrong tries lock an account for 15 minutes.
- **SMS:** sign-in codes go out through Arkesel. With `AUTH_TEST_MODE=true` no SMS is sent and the code comes back in the response (demo only).
- **Payments:** cedi collections go through a [votex365](https://partners.votex365.com/docs) hosted checkout (test keys): the response carries a `checkoutUrl`, and a signed webhook (`/webhooks/votex365`, HMAC-SHA256 over the raw body, 5-minute window) settles them. What votex365 cannot do (payouts, NGN, KES) is simulated as the test-mode contract describes.
- **Photos:** stored in the private S3 bucket (`PHOTO_BUCKET`) through the API, so phones never hold bucket access.
- **Secrets** are read at runtime with the instance role and cached for 5 minutes. The database password is fetched per new connection, so RDS's managed rotation needs no restart, and TLS to RDS is verified with the CA bundle baked into the image.

## Configuration

| Variable | Purpose |
|---|---|
| `PORT` | Default `8000` (the ALB target port) |
| `DATABASE_URL` | Local work: a full connection string. On AWS use the three below instead |
| `DB_HOST`, `DB_NAME`, `DB_SECRET_ARN` | RDS endpoint (`host:port`), database name, RDS-managed master secret |
| `DB_CA_FILE` | RDS CA bundle (set by the Dockerfile) |
| `PWA_ORIGINS` | Comma-separated browser origins allowed by CORS, e.g. `https://app.agroconnect.space` |
| `LOG_LEVEL` | `info` (default), `debug`, `warn`, `error` or `silent` |
| `JWT_SECRET_ARN` | `{ "private_key_pem": "<PKCS#8>" }`. Unset: a throwaway key (every restart signs everyone out) |
| `AUTH_TEST_MODE` | `true` returns sign-in codes instead of texting them. Default `false` |
| `SMS_SECRET_ARN` | Arkesel `{ "api_key", "sender_id", "sandbox"? }` |
| `PHOTO_BUCKET` | S3 bucket for photos. Unset: in memory (lost on restart) |
| `VOTEX_SECRET_ARN` | votex365 `{ "api_key", "webhook_secret" }`. Unset: every payment is simulated |
| `PAYMENT_RETURN_URL` | Where votex365 sends the farmer back after checkout |
| `ADMIN_SEED_SECRET_ARN` | `{ "login_id", "name", "phone", "password" }` (12+ characters): the first admin, created if missing |
| `SEED_DEMO_ACCOUNTS` | `true` seeds the public demo accounts from `WALKTHROUGH.md`. Never with real data |

## Local development

```bash
npm ci
# Any Postgres 16+ works; for example a throwaway one with Docker:
docker run -d --name agro-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
  AUTH_TEST_MODE=true SEED_DEMO_ACCOUNTS=true npm run dev
```

Point the PWA at it with `VITE_API_URL=http://localhost:8000` in `frontend/agroconnect-pwa/.env.development.local`.

## Tests

```bash
npm test                                   # on PGlite (Postgres in WebAssembly), no setup needed
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test   # on a real Postgres
```

`test/server`, `test/payments` and `test/services` are the mock server's contract tests; `test/backend` covers what only the real service does (constraints, audit, CORS, SMS, S3 keys, votex365 webhooks). CI runs both modes and boots the Docker image against an empty Postgres.

## Deploying

Merging to `main` builds the image, pushes `:latest` and `:<sha>` to ECR, and rolls the Auto Scaling Group ([`deploy.yml`](../.github/workflows/deploy.yml)). New instances migrate the database before they pass the ALB health check. See [`docs/api-tier.md`](../docs/api-tier.md) and [`docs/ci-cd-and-operations.md`](../docs/ci-cd-and-operations.md).
