# Contract: auth-service

What the PWA sends and expects from `auth-service`. Read the conventions in `API-CONTRACT.md` first: phone format, error shape, who-did-it, and which document wins over which. The PWA is built against `mock-server/` (`npm run mock`), which has tests for every case here.

All bodies are JSON. Every error is `{ "error": "<code>", "message": "<readable text>" }` and the PWA switches on `error`, never on `message`.

## Phone numbers in this contract

Every `phone` here is **E.164**: `"+233241234567"`. The PWA builds it from what the user typed, so the service does not need to guess formats. Reject anything else with 400 `invalid_request` and `field: "phone"`.

This is the same value as `farmers.phone_e164`. It is how a farmer's login account is linked to the record an agent created for them, so store and compare it exactly.

## Roles and tokens

Roles: `farmer`, `agent`, `coordinator`, `admin`.

The access token is a JWT signed with an **asymmetric key (RS256 or EdDSA)**. Only auth-service holds the private key. Other services check tokens with the **public key**, published at `GET /.well-known/jwks.json`, so no secret is shared between services.

| Claim | Meaning |
|-------|---------|
| `sub` | User ID. Other services store it as `created_by` / `updated_by` and use it for `app.actor` in the audit log. |
| `role` | One of the four roles |
| `name` | Display name |
| `phone` | The user's E.164 phone. A farmer's `GET /farmers/me` uses it. |
| `assoc` | Association ID. Set for agents and coordinators; scopes what a coordinator sees |
| `exp` | Farmers: 30 days. Agents, coordinators, admins: 7 days |

Every other service request carries `Authorization: Bearer <token>`.

## Farmer sign-in (phone, one-time code, 4-digit PIN)

### `POST /auth/farmer/start`
`{ "phone": "+233241234567", "forgotPin": false }`

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{ "next": "pin" }` | This farmer already has a PIN. Ask for it. |
| 200 | `{ "next": "otp", "expiresInSeconds": 300, "testCode": "123456" }` | A code was sent by SMS. `testCode` is present **only** when `AUTH_TEST_MODE=true`. |
| 400 | `invalid_request` | Not a valid E.164 number. |
| 429 | `rate_limited` | More than 3 codes for this phone in 15 minutes. |

`forgotPin: true` sends a code even if a PIN exists. A farmer registered by an agent signs in with the same phone number: the account is linked by phone.

### `POST /auth/farmer/verify-otp`
`{ "phone": "+233241234567", "code": "123456", "pin": "4821" }`: verifies the code and sets the PIN.

| Status | Body |
|--------|------|
| 200 | `{ "token": "...", "user": { "id", "role": "farmer", "name", "phone" } }` |
| 400 | `invalid_code` with `attemptsLeft` |
| 410 | `code_expired` |
| 422 | `invalid_pin` (must be exactly 4 digits) |
| 429 | `too_many_attempts` (5 wrong codes; request a new one) |

### `POST /auth/farmer/login`
`{ "phone": "+233241234567", "pin": "4821" }`

200 with the same body as verify-otp. 401 `wrong_pin` with `attemptsLeft`. 429 `locked`: 5 wrong PINs lock the account for 15 minutes **on the server**, because a 4-digit PIN has only 10,000 combinations and the lockout is its real protection.

## Field agents, coordinators and admins ("I work with AgroConnect")

Account lifecycle: `pending_verification → pending → approved`, or `rejected` / `suspended`.

### `POST /auth/staff/signup`
`{ "name", "phone", "association", "password" }`: password at least 8 characters. Sends a code to the phone.
201 `{ "id": "...", "status": "pending_verification", "testCode": "123456" }`. `testCode` is present only when `AUTH_TEST_MODE=true`, as with the farmer code. 409 `phone_taken`. A badly filled field returns 400 `invalid_request` with the field name in `field`.

### `POST /auth/staff/verify-phone`
`{ "phone", "code" }` → 200 `{ "status": "pending" }`. The account now waits in the admin's approvals queue.

### `POST /auth/staff/login`
`{ "identifier": "AG-0042 or +233241234567", "password": "..." }`. The agent ID is assigned when an admin approves the account. When the identifier is a phone, the PWA sends it in E.164.

| Status | `error` | PWA shows |
|--------|---------|-----------|
| 200 | none: `{ "token", "user": { "id", "role", "name", "phone", "assoc", "loginId" } }` | The app for that role |
| 401 | `invalid_credentials` | Wrong ID or password |
| 403 | `pending_verification` | Verify your phone |
| 403 | `pending_approval` | "Waiting for approval" |
| 403 | `rejected` | Account rejected |
| 403 | `suspended` | Account suspended |
| 429 | `locked` | Too many tries (5 wrong passwords: 15 minutes) |

The PWA's "Check again" button simply calls this endpoint again; it never stores the password.

Admins and coordinators sign in through this same endpoint. Admin accounts are **seeded** (`ADMIN_SEED` env), and coordinators are created by an admin.

## Session upkeep (all roles)

### `POST /auth/refresh`
`Authorization: Bearer <token>`. The token **may be expired by up to 30 days**, because phones go offline for days. The server re-checks that the account is still `approved` (or an active farmer) and returns a fresh `{ "token" }`. 403 with `suspended` or `rejected` means the app locks that user out. This is how an admin suspension reaches a phone.

### `GET /auth/me`
200 `{ "id", "role", "name", "phone", "assoc", "status", "loginId" }`.

### `GET /.well-known/jwks.json`
The public key set, for the other services.

## Storage

Tables this contract implies. Column names are suggestions; the rules are not.

**`users`**: one row per login account, all four roles.

| Column | Notes |
|--------|-------|
| `id` | The token's `sub` |
| `role` | `farmer`, `agent`, `coordinator`, `admin` |
| `name` | Empty for a farmer who signed in before an agent registered them |
| `phone_e164` | `UNIQUE` among staff; for farmers, unique per farmer. The link to `farmers.phone_e164`, **without a foreign key**: a farmer may sign in before any agent registers them. |
| `login_id` | `UNIQUE`, null until approval. `AG-0042`, `CO-001`, `ADM-001`. |
| `association_id` | Agents and coordinators. Coordinators' scope. |
| `status` | The lifecycle above. Farmers are `approved`. |
| `status_reason` | The reason an admin gave for a rejection or suspension |
| `pin_hash`, `password_hash` | argon2id or bcrypt |
| `failed_attempts`, `locked_until` | For the lockouts |
| `created_at`, `updated_at`, `created_by`, `updated_by` | Same audit columns as `farmers` |

**`otp_codes`** (or a cache with expiry): phone, code hash, expiry, attempts left, and the send times used for the rate limit.

Rules:
- Hash PINs and passwords. Never log them.
- OTPs expire after 5 minutes, allow 5 attempts, and are stored hashed.
- With `AUTH_TEST_MODE=false`, no response may contain a code.
- Attach the audit trigger from `DATA-CONTRACT.md` §5 to `users`, so every approval, rejection and suspension is recorded in `audit_log` with the admin as `app_actor`. `ADMIN-CONTRACT.md` explains how the admin screen reads it.

## Offline behaviour on the phone (for context)

The PWA caches the token and unlocks with a locally hashed PIN (4 digits for farmers, 6 for agents, coordinators and admins). Five wrong PINs wipe the stored session and require an online sign-in. Refresh is attempted whenever the app is online.
