# Contract: produce listings

A farmer lists a harvest for sale; buyers (other farmers, agents) browse and call or text the seller. Read the conventions in `API-CONTRACT.md` first. The mock in `mock-server/routes/services.mjs` implements this contract and has tests for every case.

## Privacy: read this first

A listing shows the **seller's name and phone number** to every signed-in user. That is the point of the feature (buyers call), but it is personal data under the Ghana Data Protection Act. So:

- The PWA tells the seller, on the form, that their number is shown to buyers, before they list.
- `GET /listings` needs a valid token. It must never be public.
- Only **open** listings are returned. Closing a listing removes the seller's details from the browse list.

## `POST /listings`

Role: `farmer`.

| Field | Notes |
|-------|-------|
| `clientId` | UUID, idempotency key (`UNIQUE`; a repeat returns 200 with the same record) |
| `crop` | One of the eight crop ids |
| `quantityKg` | Number, more than 0, at most 100,000 |
| `pricePerKg` | Number, more than 0, in `currency` |
| `currency` | `GHS`, `NGN` or `KES` |
| `community` | Where the produce is. Text, may be empty, at most 500 characters |

201 `{ "id": "LS-3", "status": "open" }`, or 200 with the same body for a repeat. 400 `invalid_request` with `field`. 409 `client_id_taken`.

## `GET /listings?crop=maize`

Any signed-in role. `crop` is optional (anything not a crop id is 400). Returns `{ "items": [...] }`, **open listings only**, newest first:

```json
{ "id": "LS-3", "crop": "maize", "quantityKg": 200, "pricePerKg": 5.5, "currency": "GHS",
  "community": "Ashaiman", "createdAt": "…",
  "sellerName": "Ama Mensah", "sellerPhone": "+233241234567", "mine": false }
```

`mine` is true when the caller is the seller, so the app can hide the Call and Text buttons on a farmer's own listing. `sellerName` is the registered name when a record exists, else the account name, else empty.

## `POST /listings/:id/close`

Role: `farmer`, seller only. Marks the listing sold or withdrawn. 200 `{ "id", "status": "closed" }`. 404 for anyone else's listing.

## Storage

**`listings`**: `id`, `client_id UUID NOT NULL UNIQUE`, `seller_user_id`, `crop` (CHECK), `quantity_kg NUMERIC`, `price_per_kg NUMERIC(12,2)`, `currency` (CHECK), `community`, `status` (CHECK `open`/`closed`, default `open`), and the audit columns. Attach the audit trigger.

## Offline behaviour on the phone (for context)

A listing made with no signal is saved on the phone and sent when signal returns, with the same `clientId`. Until it is sent, buyers cannot see it.
