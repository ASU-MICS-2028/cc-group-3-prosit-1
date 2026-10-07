# Contract: payments-service and loan requests

The Wallet screen in the farmer app. Read the conventions in `API-CONTRACT.md` first: phone format, error shape, who-did-it, idempotency, time zone. The mock in `mock-server/routes/payments.mjs` implements this contract and has tests for every case.

Everything runs in **test mode** (Flutterwave test keys, no real money), and the PWA labels the Wallet "Test mode, no real money". Live mode needs business verification (KYC) and is out of scope; say so in the report.

## Who can do what

| Role | Can |
|------|-----|
| `farmer` | Create payments and loan requests for themselves, read their own wallet and payments |
| `agent` | Read the payments of farmers **they registered** (`GET /farmers/:id/payments`) |
| `coordinator` | Read payments of farmers in their association |
| `admin` | Read everything |

Anything outside a role's scope returns **404**, not 403. Staff do not create payments.

## Money, networks and currencies

- Amounts are JSON numbers with at most 2 decimals. Store them as `NUMERIC(12,2)`, never as a float.
- `direction: "collect"` takes money **from** the farmer's mobile money (they pay). `direction: "payout"` sends money **to** the farmer's mobile money (they receive).
- A farmer may start a `payout` only in test mode, so the demo can show money arriving. A live service must not allow it; payouts then come from the platform.

| `currency` | Allowed `network` | Country |
|------------|-------------------|---------|
| `GHS` | `mtn`, `telecel`, `airteltigo` | Ghana |
| `KES` | `mpesa` | Kenya |
| `NGN` | `bank_transfer` | Nigeria |

## `POST /payments`

Role: `farmer`.

| Field | Type | Notes |
|-------|------|-------|
| `clientId` | UUID string | Required. Idempotency key: a retry never charges twice. |
| `direction` | `"collect" \| "payout"` | |
| `amount` | number | More than 0, at most 10,000 in test mode. |
| `currency` | `"GHS" \| "NGN" \| "KES"` | |
| `network` | string | Must belong to the currency (table above). |
| `phone` | E.164 string | The mobile money number. It may differ from the farmer's login phone. |

| Status | Body | PWA behaviour |
|--------|------|---------------|
| 201 | `{ "id": "P-17", "status": "pending" }` | Shows "Waiting: approve the prompt on your phone" and starts polling. |
| 200 | `{ "id", "status" }` (same `clientId`, same farmer) | Same as above, using the current status. |
| 400 | `invalid_request` with `field` | Marks the request **Needs attention** and shows `message`. |
| 401, 403 | | 403 for any role except `farmer`. |
| 409 | `client_id_taken` | The `clientId` belongs to a different account. |
| 408, 429, 5xx, no response | | Temporary: stays queued and is retried. |

Enforce idempotency with `UNIQUE (client_id)` and catch `23505`, as in `API-CONTRACT.md`. Rate-limit a farmer to a sensible number of requests per minute.

## `GET /payments/:id`

Roles: the owning `farmer`, or staff within their scope.

```json
{ "id": "P-17", "clientId": "…", "direction": "collect", "amount": 50, "currency": "GHS",
  "network": "mtn", "phone": "+233241234567", "status": "pending", "createdAt": "…" }
```

`status` is `pending`, `successful` or `failed`, and the last two are final. The PWA polls this every 4 seconds while a payment is pending, for up to 2 minutes, then tells the farmer to check the Wallet later. Map the provider's states onto these three.

## `GET /payments/me`

Role: `farmer`. Their wallet:

```json
{
  "balance": [{ "currency": "GHS", "received": 300, "paid": 80, "amount": 220 }],
  "items": [ /* payments as above, newest first */ ]
}
```

Only `successful` payments count. `received` is the total paid out to the farmer, `paid` the total collected from them, and `amount = received − paid`. `balance` has one row per currency that has a successful payment.

## `GET /farmers/:id/payments`

Roles: `agent`, `coordinator`, `admin`. `:id` is the farmer **record** id (the one returned when the agent registered them), not the login account's id. Same response as `/payments/me`. Link the record to the login account by phone (`farmers.phone_e164` = `users.phone_e164`); if the farmer has no account yet, return an empty list, not an error. 404 for an unknown farmer or one outside the caller's scope.

## `POST /loan-requests`

Role: `farmer`. A request for an input loan, passed on to a partner microfinance institution.

| Field | Notes |
|-------|-------|
| `clientId` | UUID, idempotency key |
| `amount` | More than 0, at most 50,000 |
| `currency` | `GHS`, `NGN` or `KES` |
| `purpose` | Text, 1 to 200 characters |

201 `{ "id": "L-3", "status": "received" }`, or 200 with the same body for a repeat. Errors as for payments. `received` is the only status for now; a later contract adds the partner's decision.

## Provider webhook

`POST /webhooks/flutterwave` is called by Flutterwave, never by the PWA. Check the `verif-hash` header against the secret hash you configured and reject anything else with 401. Use your own payment `id` as the provider reference (`tx_ref`) so a replayed webhook updates the same row. Respond 200 quickly.

## Storage

Suggested tables (the rules matter more than the names):

**`payments`**: `id`, `client_id UUID NOT NULL UNIQUE`, `farmer_user_id`, `direction` (CHECK in the two values), `amount NUMERIC(12,2) CHECK (amount > 0)`, `currency` (CHECK), `network`, `phone_e164`, `status` (CHECK, default `pending`), `provider_ref`, `created_at`, `updated_at`, `created_by`, `updated_by`.

**`loan_requests`**: `id`, `client_id UUID NOT NULL UNIQUE`, `farmer_user_id`, `amount NUMERIC(12,2)`, `currency`, `purpose`, `status` (default `received`), and the same audit columns.

Attach the audit trigger from `DATA-CONTRACT.md` §5 to both.

## Security

- The Flutterwave secret key lives in an environment variable or a secrets manager. It never goes to the PWA, and it is never logged.
- Do not trust amounts or status from the phone: the status comes from the provider, and the amount is validated server-side.

## Offline behaviour on the phone (for context)

A payment request made with no signal is saved on the phone and shown as "Will send when signal returns". It is never shown as paid. When the phone reconnects it sends the request with the same `clientId`, so a request that reached the server but lost its reply is not charged twice.
