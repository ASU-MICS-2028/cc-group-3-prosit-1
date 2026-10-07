# API contract: PWA ↔ farmer-profile-service

What the PWA sends and expects, and the four changes needed in the Express service. The reference behaviour is `mock-server/server.mjs` (run `npm run mock`); it passes every case below.

The PWA saves everything on the phone first and sends later, sometimes hours later and sometimes twice. That is why the changes below exist.

## Changes needed

| # | Change | Why |
|---|--------|-----|
| 1 | Accept `clientId` in `POST /farmers` and store it | The phone creates the farmer's ID (a UUID) before the server has seen the record. The server's `nextId++` stays as its own `id`. |
| 2 | A repeated `clientId` returns the **existing** farmer's `id` (200), not a new record | A request can succeed on the server while the response is lost on a bad connection. The PWA then sends the same record again. |
| 3 | Enable CORS | Browsers block the PWA from calling an API on another origin until the API allows it. |
| 4 | Return **409** if a *different* `clientId` has the same phone number | Two registerers can sign up the same farmer offline. |
| 5 | New: `POST /farmers/:id/photo` | Photos are sent after the text data, as a separate request. |

## Added with the login system

- **Authorization:** every request carries `Authorization: Bearer <token>`, signed by auth-service (see `AUTH-CONTRACT.md`). Verify it with auth-service's public key. CORS must allow the `Authorization` header as well as `Content-Type`.
- **`registeredBy`:** the server sets it from the token's `sub`. The PWA never sends it, so an agent cannot register as someone else.
- **`gender`:** new optional field, `"female" | "male" | "undisclosed" | null`.
- **Who can call what:** `POST /farmers` and its photo endpoint need role `agent` or `coordinator`. A `farmer` token gets 403 there.
- **`GET /farmers/me`:** for a signed-in farmer. Finds their profile by the token's phone number (this links the two paths) and returns the record, or 404 if no agent has registered them yet.
- A request with a missing, invalid or expired token returns **401**. The PWA then tries `POST /auth/refresh` and retries once.

## Endpoints

### `POST /farmers`

Request body (JSON):

| Field | Type | Notes |
|-------|------|-------|
| `clientId` | string (UUID) | Required. |
| `name` | string | Required. |
| `phone` | string | Required. Sent as typed with spaces and dashes removed: `0241234567` or `+233241234567`. Compare numbers in one normalised form, such as `+233XXXXXXXXX`, or `0241234567` and `+233241234567` will not match. |
| `preferredLanguage` | `"en" \| "tw" \| "ee" \| "dag"` | |
| `gender` | `"female" \| "male" \| "undisclosed" \| null` | Optional. |
| `community`, `region` | string | May be empty. |
| `farmSizeAcres` | number \| null | |
| `crops` | string[] | From: maize, tomato, cassava, pepper, okro, yam, cocoa, plantain. |
| `gps` | `{ lat, lng, accuracy, capturedAt } \| null` | `accuracy` in metres. |
| `consent` | boolean | Always `true`; the PWA will not send without it. |
| `registeredAt` | ISO 8601 string | When it was registered on the phone, not when it arrived. |

Responses:

| Status | Body | PWA behaviour |
|--------|------|---------------|
| 201 | `{ "id": "<server id>" }` | Marks the farmer **Sent**. |
| 200 | `{ "id": "<server id>" }` (same `clientId` seen before) | Marks the farmer **Sent**. |
| 400 | `{ "error": "<reason>" }` | Marks **Needs attention** and shows the reason. |
| 409 | `{ "error": "<reason>" }` (duplicate phone) | Marks **Needs attention** and shows the reason. |
| 408, 429, 5xx, or no response | any | Treated as temporary. The record stays **Saved on phone** and is retried. |

Any other 4xx counts as a refusal (**Needs attention**). Keep `error` readable by a registerer, because it is displayed.

### `POST /farmers/:id/photo`

`:id` is the server `id` from the response above. The body is the raw JPEG (`Content-Type: image/jpeg`), about 100 KB.

| Status | PWA behaviour |
|--------|---------------|
| 200 | Photo marked sent. |
| 404 (unknown id), 413 (too large), other 4xx | Photo is not retried. |
| 408, 429, 5xx, or no response | Retried later. |

### `GET /health`, `GET /farmers/:id`

Unchanged.

## Reference Express changes

Written against the mock and the description in CLAUDE.md, **not** against the real source, so adapt the names (`farmers`, `nextId`) to what the service uses. Needs `npm i cors`.

```js
const cors = require('cors')

app.use(cors())            // change 3: tighten to the PWA's origin once it is hosted
app.use(express.json())

app.post('/farmers', (req, res) => {
  const { clientId, name, phone } = req.body
  if (!clientId || !name || !phone) {
    return res.status(400).json({ error: 'name, phone and clientId are required' })
  }

  const same = farmers.find((f) => f.clientId === clientId)           // change 2
  if (same) return res.status(200).json({ id: same.id })

  if (farmers.some((f) => normalisePhone(f.phone) === normalisePhone(phone))) {  // change 4
    return res.status(409).json({ error: 'A farmer with this phone number is already registered' })
  }

  const farmer = { ...req.body, id: String(nextId++) }                // change 1
  farmers.push(farmer)
  res.status(201).json({ id: farmer.id })
})

app.post('/farmers/:id/photo', express.raw({ type: 'image/*', limit: '500kb' }), (req, res) => {  // change 5
  const farmer = farmers.find((f) => f.id === req.params.id)
  if (!farmer) return res.status(404).json({ error: 'Unknown farmer' })
  farmer.photoBytes = req.body.length   // keep or store the image as the team decides
  res.status(200).json({ bytes: req.body.length })
})
```

`normalisePhone` should turn `0241234567`, `+233241234567` and `233241234567` into the same string.

When the database arrives in Week 4, changes 2 and 4 become unique constraints on `clientId` and on the normalised phone number.

## Check it works

1. Start the real service and set `VITE_API_URL` to its address.
2. Register one farmer on the PWA with data on. It should show **Sent**.
3. Register a second farmer with the same phone number. It should show **Needs attention** with the 409 reason.
4. In a terminal, send the same `POST /farmers` body twice. The `id` in both replies should be identical.
