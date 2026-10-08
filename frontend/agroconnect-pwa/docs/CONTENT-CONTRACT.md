# Contract: market prices and advice cards

What the farmer's Home, Market and Advice screens read, and what admins and coordinators enter. Read the conventions in `API-CONTRACT.md` first: error shape, roles, time zone. The mock (`mock-server/routes/content.mjs`) and the real API (`backend/src/routes/content.ts`) both implement this and share its tests.

Until anything has been entered for a country, the PWA keeps showing its built-in sample prices and advice, labelled "Sample", so the app is never empty.

## Who can do what

| Role | Can |
|------|-----|
| any signed-in user | Read prices and advice |
| `admin`, `coordinator` | Record prices, publish and archive advice |

## `GET /market-prices?country=GH`

`country` is `GH`, `NG` or `KE`; anything else is 400 `invalid_request` with `field: "country"`.

```json
{
  "country": "GH",
  "currency": "GHS",
  "updatedOn": "2026-10-08",
  "items": [{ "crop": "maize", "price": 5.2, "change": 3, "recordedOn": "2026-10-08" }]
}
```

- One item per crop that has a price, in the PWA's crop order. `items` is empty (and `updatedOn` null) when nothing has been recorded.
- `price` is per kg in the country's currency.
- `change` is the whole-number percentage against the latest price for that crop recorded **at least 7 days earlier**, or 0 when there is none ("up 3% this week").

## `POST /admin/market-prices`

Roles: `admin`, `coordinator`. `{ "country": "GH", "crop": "maize", "pricePerKg": 5.2, "recordedOn": "2026-10-08" }`

- `recordedOn` is optional (today in Africa/Accra) and may not be in the future.
- One price per country, crop and day: recording the same day again replaces it and answers **200**; a new day answers **201**. Body: `{ "country", "crop", "price", "recordedOn" }`.
- 400 `invalid_request` with `field` for a bad value; `pricePerKg` must be more than 0 and at most 1,000,000.

## `GET /advice`

Any signed-in user. Published cards, newest first:

```json
{ "items": [{ "id": "AD-3", "crop": "tomato", "title": "Water at the base", "body": "…", "createdAt": "…", "byName": "Ama Admin" }] }
```

## `POST /admin/advice`

Roles: `admin`, `coordinator`. `{ "crop": "tomato", "title": "…", "body": "…" }`: `title` 1–80 characters, `body` 1–500. **201** `{ "id" }`.

## `POST /admin/advice/:id/archive`

Roles: `admin`, `coordinator`. Hides a card from `GET /advice`. **200** `{ "id", "archived": true }`, or 404 for an unknown card.

## Storage

`market_prices (country, crop, price_per_kg NUMERIC(12,2), currency, recorded_on DATE, UNIQUE (country, crop, recorded_on))` and `advice_cards (crop, title, body, archived, …)`, both with the audit columns and the audit trigger (`backend/migrations/002_market_prices_and_advice.sql`).
