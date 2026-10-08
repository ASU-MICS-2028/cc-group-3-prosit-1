# Contract: feature-phone access (USSD) and follow-up requests

The Prosit brief asks for "SMS/USSD integration for feature phone access": a quarter of farmers have basic phones, and 5% none. This is the USSD side. The PWA only uses the follow-up requests list (`GET /admin/requests`); the menu itself runs on the gateway.

## The menu

A farmer dials the AgroConnect USSD code. A registered farmer gets their language at once; anyone else picks English, Twi or Ewe first.

```
AgroConnect
1 Market prices        → pick a crop → "Tomato: GHS 10.00 per kg (up 25% this week). Updated 2026-10-08."
2 Farming advice       → latest 4 cards → the chosen card's text
3 My registration      → the record an agent made for this number, or how to get registered
4 Ask for an agent visit → confirm → a request coordinators see in the PWA (More → Requests from farmers)
5 Today's weather      → min/max and rain chance at the registered farm's GPS point (Open-Meteo), with a spraying tip
0 Exit
```

Prices and advice are the ones admins and coordinators enter (`CONTENT-CONTRACT.md`); the country comes from the caller's number (+233 Ghana, +234 Nigeria, +254 Kenya).

## `POST /ussd` (gateway callback)

Arkesel's USSD format: one POST per key press, JSON in and out.

Request: `{ "sessionID", "userID", "newSession": true|false, "msisdn": "233241234567", "userData": "1", "network" }`
Response: `{ "sessionID", "userID", "msisdn", "message", "continueSession": true|false }`

- **Off unless configured.** The API answers 404 until `USSD_USER_ID` is set (Terraform variable `ussd_user_id`).
- **Only our gateway account.** A request whose `userID` is not ours gets 403. The gateway does not sign requests, so this check is the protection, and `/ussd` is exempt from the per-IP rate limit (all sessions arrive from the gateway's few IPs).
- **State between key presses** lives in `ussd_sessions` (Postgres), because each press may reach a different instance. Sessions older than a day are deleted.

## `GET /admin/requests?status=open|done`, `POST /admin/requests/:id/done`

Roles: `admin`, `coordinator`. A coordinator sees requests from their association's farmers and from callers no agent has registered yet (so nobody is left out). Each item: `{ id, phone, channel, kind, language, status, createdAt, farmer: { id, name, community } | null, handledBy, handledAt }`. Marking one done records who and when, and the audit trigger logs it.

## Setting it up

1. Ask Arkesel for a USSD code (shared codes like `*928*NN#` are cheapest) and give them the endpoint `https://api.agroconnect.space/ussd`.
2. Put the `userID` they assign in `infra/terraform.tfvars` as `ussd_user_id = "…"` and `terraform apply`.
3. Test with Arkesel's USSD simulator app, or with `curl` (see `backend/test/ussd.test.mjs` for the request shape).
