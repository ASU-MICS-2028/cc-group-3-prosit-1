# Contract: crop checks and advice

A farmer photographs a sick plant and describes it; an extension officer answers. Read the conventions in `API-CONTRACT.md` first: error shape, who-did-it, idempotency, time. The mock in `mock-server/routes/services.mjs` implements this contract and has tests for every case.

## Who can do what

| Role | Can |
|------|-----|
| `farmer` | Send a crop check and its photo; read their own checks and the advice on them |
| `agent`, `coordinator` | Read open and answered checks **in their area**, view photos, give advice |
| `admin` | Everything the above can, for every area |

**Area.** A crop check belongs to the association of the agent who registered that farmer (`farmers.created_by` → the agent's association, as in `ADMIN-CONTRACT.md`). An agent or coordinator sees checks from their own association's farmers, **and** checks from a farmer no agent has registered yet, so no question goes unanswered. Anything outside that returns **404**, not 403.

## `POST /crop-checks`

Role: `farmer`.

| Field | Notes |
|-------|-------|
| `clientId` | UUID, idempotency key (`UNIQUE`; a repeat returns 200 with the same record) |
| `crop` | One of the eight crop ids in `API-CONTRACT.md` |
| `note` | What the farmer sees, 1 to 500 characters |

201 `{ "id": "CC-4", "status": "open" }`, or 200 with the same body for a repeat. 400 `invalid_request` with `field`. 409 `client_id_taken` if the `clientId` belongs to another account.

## `POST /crop-checks/:id/photo`

Role: `farmer`, owner only. Body: the raw JPEG, about 100 KB, at most 500 KB (413 above that). One photo per check; sending again replaces it. Store it in S3 (for example `crop-checks/<id>/photo.jpg`) and keep the key in the row, as for farmers. 200 `{ "bytes": n }`. 404 for an unknown check or one that is not theirs.

The photo goes after the text because the phone sends text first on a weak connection. It is also worth keeping every photo with its eventual advice, as training data for the disease-detection model that is planned but not built.

## `GET /crop-checks/:id/photo`

Roles: the owning farmer, and staff who can see the check. Returns the JPEG (`Content-Type: image/jpeg`). It needs the `Authorization` header, so the PWA fetches it as a file and shows it from memory. 404 if there is no photo or the caller may not see it. Do not make photo URLs public or guessable.

## `GET /crop-checks/me`

Role: `farmer`. `{ "items": [...] }`, newest first, of their own checks, including any advice.

## `GET /crop-checks?status=open|answered`

Roles: `agent`, `coordinator`, `admin`. `{ "items": [...] }`, newest first, limited to the caller's area. `status` is optional; anything else is 400.

Each item (here and in `/crop-checks/me`):

```json
{
  "id": "CC-4", "clientId": "…", "crop": "tomato", "note": "Brown spots on the leaves",
  "status": "open", "createdAt": "2026-10-07T09:12:00Z",
  "farmerName": "Ama Mensah", "farmerPhone": "+233241234567",
  "hasPhoto": true,
  "advice": null
}
```

When answered, `status` is `"answered"` and `advice` is `{ "text", "by", "at" }`. `farmerName` is the registered name when a record exists, else the account name, else empty.

## `POST /crop-checks/:id/advice`

Roles: `agent`, `coordinator`, `admin`, within their area. Body `{ "text": "…" }`, 1 to 500 characters. 200 with the updated item. A check can be answered **once**: a second answer returns 409 `already_answered`. 404 outside the caller's area.

## Admin inbox

`GET /admin/activity?type=cropcheck` (admin only) returns `{ "items": [...] }` in the same shape, for every area.

## Storage

**`crop_checks`**: `id`, `client_id UUID NOT NULL UNIQUE`, `farmer_user_id`, `crop` (CHECK), `note`, `status` (CHECK `open`/`answered`, default `open`), `photo_object_key`, `advice_text`, `advice_by`, `advice_at`, and the audit columns from `DATA-CONTRACT.md`. Attach the audit trigger to it.

## Offline behaviour on the phone (for context)

A crop check made with no signal is saved on the phone and shown as "Will send when signal returns". When signal returns the phone sends the text, then the photo, with the same `clientId`. If the photo fails after the text succeeded, the whole item is tried again, which is safe because both calls are idempotent.
