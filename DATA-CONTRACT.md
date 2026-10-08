# Data contract: farmer-profile-service ↔ Postgres

> **Status (8 Oct 2026): implemented** in [`backend/migrations/001_initial.sql`](backend/migrations/001_initial.sql). RDS was empty, so the schema is created directly rather than through the incremental C1–C7 steps in §8, and the three defects found in this document are fixed there:
> - `client_id` is `UUID NOT NULL UNIQUE` (not nullable), so every request goes through the idempotency check.
> - The acting user reaches the audit trigger through `SELECT set_config('app.actor', $1, true)`, never a string-built `SET LOCAL`.
> - There is no old `phone` column to copy, so the leading-0 problem in C1 cannot occur; the `phone_national` CHECK also rejects a leading 0.
>
> The trigger (`audit_row()`) also covers `users`, `payments`, `loan_requests`, `crop_checks` and `listings`, strips PIN and password hashes, and skips login bookkeeping (`failed_attempts`, `locked_until`).

Reply to `API-CONTRACT.md`. What the database stores, what it enforces, and the five things the PWA needs to change or confirm.

## The short version

The API contract's closing line was right — changes 2 and 4 become database constraints. They now are. That means the Node.js/Express service no longer has to *decide* whether a record is a duplicate; it catches the error Postgres raises and maps it to a status code.

---

## 1. What changed, and why

| # | Change | Reason |
|---|---|---|
| 1 | Phone split into `country_code` + `phone_national` | Postgres computes the combined form itself, so the PWA, API and database can't drift apart. Also required for expansion beyond Ghana. |
| 2 | `client_id` stored with a UNIQUE constraint | Change 2 in the API contract. A repeated offline send fails at the database, not in application logic. |
| 3 | Farm size stored in **hectares**, entered value kept alongside | Lab/MoFA reporting standard is hectares. Keep the UI in acres — registerers think in acres. |
| 4 | Crops moved to farmer level | The API contract sends `crops` with no farm. The earlier schema hung crops off a farm that the PWA never creates. |
| 5 | Standard audit fields + audit log | Main tables record who/when created or last updated a record, while the audit log preserves the full history of changes. |

---

## 2. Phone numbers

**What the PWA should send:**

| Field | Type | Example | Notes |
|---|---|---|---|
| `countryCode` | string | `"+233"` | Includes the `+`. Default `+233`, selectable for future countries. |
| `phoneNational` | string | `"241234567"` | Digits only. **Strip any leading 0** — Ghana's trunk prefix is not part of the international number. |

So `0241234567` typed by a registerer becomes:

```text
countryCode: "+233"
phoneNational: "241234567"
```

**What the database does with it:** combines them into E.164 form (`+233241234567`) automatically and enforces uniqueness on that.

Two agents who type the same number differently now collide correctly, with no normalisation code required in the database.

---

## 3. Field mapping

| PWA sends | Column | Notes |
|---|---|---|
| `clientId` | `client_id` (UUID, UNIQUE) | |
| `name` | `name` | |
| `countryCode` + `phoneNational` | `country_code`, `phone_national` | `phone_e164` generated, UNIQUE |
| `preferredLanguage` | `language` | Constrained to `en`, `tw`, `ee`, `dag` |
| `community`, `region` | `community`, `region` | |
| `farmSizeAcres` | `farm_size_hectares` (converted) + `farm_size_entered`, `farm_size_unit` | See §4 |
| `crops[]` | `farmer_crops` rows | One row per crop |
| `gps` | `gps_lat`, `gps_lng`, `gps_accuracy_m`, `gps_captured_at` | |
| `consent` | `consent`, `consent_at` | |
| `registeredAt` | `registered_at` | Phone time — distinct from `created_at`, which is server time |
| photo | `photo_object_key` | S3 key only; the JPEG lives in the bucket |

### Standard audit fields

The main data tables will also have:

| Column | Holds |
|---|---|
| `created_at` | When the record was created on the server |
| `updated_at` | When the record was last updated |
| `created_by` | User/agent who created the record |
| `updated_by` | User/agent who last updated the record |

These fields are different from `registered_at`.

`registered_at` answers **when the farmer was registered on the phone**, while `created_at` answers **when the farmer record was created in the backend**.

---

## 4. Farm size units

Decision: **store hectares, display acres, record what was typed.**

```text
hectares = acres × 0.404686
```

Three columns, not one:

- `farm_size_hectares` — canonical, used for all reporting
- `farm_size_entered` — the number the registerer actually typed
- `farm_size_unit` — the unit they used (`acres`)

The last two cost almost nothing and mean a conversion bug is recoverable. Without them, if the multiplier is ever wrong, the original figures are gone.

**No change needed on the PWA side** — keep sending `farmSizeAcres`. The API converts.

---

## 5. Standard auditing + audit log

We will use **both standard audit fields and a separate audit log**.

### Standard audit fields

`farmers`, `farms` and `farmer_crops` will contain:

```text
created_at
updated_at
created_by
updated_by
```

These provide quick access to the current record's creation and update information.

### Audit log

The separate `audit_log` remains because it provides the historical record of every change.

Every insert, update and delete on `farmers`, `farms` and `farmer_crops` writes a row to `audit_log` automatically, via database triggers.

| Column | Holds |
|---|---|
| `table_name`, `record_id` | What changed |
| `action` | INSERT / UPDATE / DELETE |
| `old_data`, `new_data` | Full row before and after, as JSONB |
| `changed_at` | Server timestamp |
| `changed_by` | Database user |
| `app_actor` | **The Node.js/Express application user/agent who performed the action** |

The database knows the connection is the PostgreSQL user; it cannot automatically know which registerer made the change.

Before each write, the Node.js/Express service sets, inside the transaction:

```sql
SELECT set_config('app.actor', $1, true);  -- $1 = the token's sub; true = local to this transaction
```

(`SET LOCAL app.actor = '…'` cannot take a parameter, so building it from a string would invite SQL injection.)

The audit trigger reads this value.

Without it, audit rows are still written, but the application-level actor cannot be attributed to a specific registerer.

---

## 6. Status codes, and where they now come from

| Situation | Database behaviour | Node.js/Express service returns |
|---|---|---|
| New farmer | Insert succeeds | **201** + `id` |
| Same `client_id` again | Unique violation on `client_id` (SQLSTATE `23505`) | **200** + existing `id` — look it up and return it |
| Different `client_id`, same phone | Unique violation on `phone_e164` | **409** + readable reason |
| Missing name/phone/clientId | NOT NULL violation (`23502`) | **400** |

**The important shift:** the service no longer searches for duplicates before inserting. It attempts the insert and handles the database constraint error.

That removes the race condition where two requests can both check for a record, both find nothing, and both insert.

Both duplicate cases raise `23505`, so the service must check the constraint name to tell them apart:

- `farmers_client_id_key` → retry/idempotent request → **200**
- `farmers_phone_e164_key` → genuine duplicate → **409**

---

## 7. What the PWA needs to confirm/change

1. **Phone fields** — Can the PWA send `countryCode` and `phoneNational` separately? If the UI keeps one field, the split can happen in the PWA before sending.
2. **Leading zeros** — Confirm `024...` is stripped to `24...` before sending.
3. **Crops at farmer level** — Confirm that crops remain at farmer level.
4. **Photo** — One photo per farmer, or many? Currently one (`photo_object_key`). Many means a separate table.
5. **Agent/registerer identity** — Does the PWA have an agent/registerer identity it can send so the API can set `app.actor` for auditing?

---

## 8. The migration

The migration will implement:

### C1 — Phone

```sql
ALTER TABLE farmers
  ADD COLUMN country_code   TEXT NOT NULL DEFAULT '+233',
  ADD COLUMN phone_national TEXT;

UPDATE farmers
SET phone_national = phone
WHERE phone_national IS NULL;

ALTER TABLE farmers
  ALTER COLUMN phone_national SET NOT NULL,
  DROP COLUMN phone;

ALTER TABLE farmers
  ADD COLUMN phone_e164 TEXT
    GENERATED ALWAYS AS (country_code || phone_national) STORED;

ALTER TABLE farmers
  ADD CONSTRAINT farmers_phone_e164_key UNIQUE (phone_e164);
```

### C2 — Offline-sync, consent, GPS and provenance columns

```sql
ALTER TABLE farmers
  ADD COLUMN client_id         UUID UNIQUE,
  ADD COLUMN community         TEXT,
  ADD COLUMN consent           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN consent_at        TIMESTAMPTZ,
  ADD COLUMN registered_at     TIMESTAMPTZ,
  ADD COLUMN gps_lat           NUMERIC(9,6),
  ADD COLUMN gps_lng           NUMERIC(9,6),
  ADD COLUMN gps_accuracy_m    NUMERIC,
  ADD COLUMN gps_captured_at   TIMESTAMPTZ,
  ADD COLUMN farm_size_entered NUMERIC,
  ADD COLUMN farm_size_unit    TEXT DEFAULT 'acres',
  ADD COLUMN photo_object_key  TEXT;
```

### C3 — Standard audit fields

Add the following to `farmers`, `farms` and `farmer_crops`:

```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
created_by  TEXT,
updated_by  TEXT
```

`updated_at` and `updated_by` should be updated whenever the record changes.

### C4 — Language

```sql
ALTER TABLE farmers
  ADD CONSTRAINT farmers_language_check
  CHECK (language IN ('en','tw','ee','dag'));
```

### C5 — Crops at farmer level

```sql
CREATE TABLE farmer_crops (
  id         SERIAL PRIMARY KEY,
  farmer_id  INTEGER NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  crop_type  TEXT NOT NULL,
  UNIQUE (farmer_id, crop_type)
);
```

### C6 — Audit log

Keep the existing audit log concept:

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  changed_by  TEXT NOT NULL DEFAULT current_user,
  app_actor   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### C7 — Audit triggers

Attach the audit trigger to:

- `farmers`
- `farms`
- `farmer_crops`

The trigger automatically records every INSERT, UPDATE and DELETE.

---

## 9. Checking it works

### Create a farmer

```sql
SELECT set_config('app.actor', 'agent-demo', true);

INSERT INTO farmers (
  name,
  country_code,
  phone_national,
  language,
  client_id,
  consent,
  registered_at
)
VALUES (
  'Efua Mensah',
  '+233',
  '241234567',
  'tw',
  '11111111-1111-1111-1111-111111111111',
  true,
  now()
);
```

Expected phone:

```text
+233241234567
```

Then:

```sql
SELECT
  table_name,
  action,
  app_actor,
  changed_at
FROM audit_log
ORDER BY id DESC
LIMIT 1;
```

Expected:

```text
farmers | INSERT | agent-demo | <timestamp>
```

### Confirm duplicate phone protection

```sql
INSERT INTO farmers (
  name,
  country_code,
  phone_national,
  client_id,
  consent
)
VALUES (
  'Different Person',
  '+233',
  '241234567',
  '22222222-2222-2222-2222-222222222222',
  true
);
```

Expected:

```text
ERROR duplicate key value violates unique constraint "farmers_phone_e164_key"
```

---

## 10. Infrastructure note

The AgroConnect AWS infrastructure will use:

```text
AWS Region: af-south-1
Region: Africa (Cape Town)
```

The RDS PostgreSQL instance and the S3 media bucket are provisioned in `af-south-1` by the Terraform
configuration (the `database` and `storage` modules inherit the default `af-south-1` provider), so no
recreation is outstanding. Only the frontend's AWS Amplify Hosting stays in `eu-west-1`, because Amplify
is not offered in `af-south-1` (ADR-009).

This is an **AWS infrastructure decision**, not a farmer data-contract requirement.

Database timestamps remain timezone-aware (`TIMESTAMPTZ`). Farmer registration times should represent the actual registration event in Ghana, while the database maintains consistent timezone-aware timestamps.