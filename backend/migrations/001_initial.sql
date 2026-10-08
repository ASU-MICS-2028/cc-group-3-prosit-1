-- AgroConnect schema: DATA-CONTRACT.md plus the tables the AUTH, ADMIN, PAYMENTS, ADVICE and LISTINGS
-- contracts in frontend/agroconnect-pwa/docs/ imply. It also closes the API-CONTRACT open items:
-- client_id is NOT NULL UNIQUE everywhere, gender has a CHECK, consent_at comes from registered_at,
-- the old farms/farm_crops/farm_media tables are gone, and the acting user reaches the audit trigger
-- through set_config('app.actor', $1, true) (see src/db.ts), never a string-built SET LOCAL.

-- Who did it ----------------------------------------------------------------------------------------

-- The app sets app.actor / app.actor_role per transaction; NULL when a change has no signed-in user.
CREATE FUNCTION current_actor() RETURNS TEXT LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.actor', true), '') $$;

CREATE FUNCTION current_actor_role() RETURNS TEXT LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.actor_role', true), '') $$;

-- Keeps updated_at / updated_by honest without every UPDATE having to remember them.
CREATE FUNCTION touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := coalesce(current_actor(), NEW.updated_by);
  RETURN NEW;
END $$;

-- Associations -------------------------------------------------------------------------------------

CREATE TABLE associations (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO associations (id, name) VALUES
  ('ashaiman-ufa', 'Ashaiman Urban Farmers Association'),
  ('ngfn', 'Northern Ghana Farmers Network');

-- Accounts (AUTH-CONTRACT) -------------------------------------------------------------------------

CREATE SEQUENCE users_seq;
CREATE SEQUENCE agent_login_seq;
CREATE SEQUENCE coordinator_login_seq;

CREATE TABLE users (
  id              TEXT PRIMARY KEY DEFAULT 'U-' || nextval('users_seq'),
  role            TEXT NOT NULL CHECK (role IN ('farmer', 'agent', 'coordinator', 'admin')),
  name            TEXT NOT NULL DEFAULT '',
  phone_e164      TEXT NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  login_id        TEXT UNIQUE,
  association_id  TEXT REFERENCES associations (id),
  status          TEXT NOT NULL CHECK (status IN ('pending_verification', 'pending', 'approved', 'rejected', 'suspended')),
  status_reason   TEXT,
  pin_hash        TEXT,
  password_hash   TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT,
  updated_by      TEXT
);

-- A phone is unique among staff and, separately, among farmers: one person can be both.
CREATE UNIQUE INDEX users_farmer_phone_key ON users (phone_e164) WHERE role = 'farmer';
CREATE UNIQUE INDEX users_staff_phone_key ON users (phone_e164) WHERE role <> 'farmer';

-- One row per phone. Codes are stored hashed; sent_at keeps the send times for the rate limit.
CREATE TABLE otp_codes (
  phone_e164    TEXT PRIMARY KEY,
  code_hash     TEXT,
  expires_at    TIMESTAMPTZ,
  attempts_left INTEGER NOT NULL DEFAULT 0,
  sent_at       TIMESTAMPTZ[] NOT NULL DEFAULT '{}'
);

-- Farmers (DATA-CONTRACT, API-CONTRACT) ------------------------------------------------------------

CREATE TABLE farmers (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id          UUID NOT NULL CONSTRAINT farmers_client_id_key UNIQUE,
  name               TEXT NOT NULL CHECK (btrim(name) <> ''),
  country_code       TEXT NOT NULL CHECK (country_code ~ '^\+[1-9][0-9]{0,2}$'),
  phone_national     TEXT NOT NULL CHECK (phone_national ~ '^[1-9][0-9]{6,13}$'),
  phone_e164         TEXT GENERATED ALWAYS AS (country_code || phone_national) STORED
                     CONSTRAINT farmers_phone_e164_key UNIQUE,
  language           TEXT CHECK (language IN ('en', 'tw', 'ee', 'dag')),
  gender             TEXT CHECK (gender IN ('female', 'male', 'undisclosed')),
  community          TEXT,
  region             TEXT,
  farm_size_hectares NUMERIC(12, 4) CHECK (farm_size_hectares >= 0),
  farm_size_entered  NUMERIC CHECK (farm_size_entered >= 0),
  farm_size_unit     TEXT CHECK (farm_size_unit IN ('acres')),
  gps_lat            NUMERIC(9, 6) CHECK (gps_lat BETWEEN -90 AND 90),
  gps_lng            NUMERIC(9, 6) CHECK (gps_lng BETWEEN -180 AND 180),
  gps_accuracy_m     NUMERIC CHECK (gps_accuracy_m >= 0),
  gps_captured_at    TIMESTAMPTZ,
  consent            BOOLEAN NOT NULL,
  consent_at         TIMESTAMPTZ,
  registered_at      TIMESTAMPTZ NOT NULL,
  photo_object_key   TEXT,
  photo_bytes        INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         TEXT NOT NULL REFERENCES users (id),
  updated_by         TEXT
);

CREATE INDEX farmers_created_by_idx ON farmers (created_by);

CREATE TABLE farmer_crops (
  farmer_id  BIGINT NOT NULL REFERENCES farmers (id) ON DELETE CASCADE,
  crop_type  TEXT NOT NULL CHECK (crop_type IN ('maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  PRIMARY KEY (farmer_id, crop_type)
);

-- Admin (ADMIN-CONTRACT) ---------------------------------------------------------------------------

-- One row per agent, overwritten by each heartbeat; no history.
CREATE TABLE agent_sync_status (
  agent_id     TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  pending      INTEGER NOT NULL CHECK (pending >= 0),
  attention    INTEGER NOT NULL CHECK (attention >= 0),
  last_sync_at TIMESTAMPTZ,
  app_version  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE feedback (
  seq          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id           TEXT GENERATED ALWAYS AS ('FB-' || seq) STORED UNIQUE,
  client_id    UUID NOT NULL CONSTRAINT feedback_client_id_key UNIQUE,
  user_id      TEXT NOT NULL REFERENCES users (id),
  role         TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  screen       TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  app_language TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL,
  created_by   TEXT NOT NULL
);

-- Payments (PAYMENTS-CONTRACT) ---------------------------------------------------------------------

CREATE TABLE payments (
  seq            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id             TEXT GENERATED ALWAYS AS ('P-' || seq) STORED UNIQUE,
  client_id      UUID NOT NULL CONSTRAINT payments_client_id_key UNIQUE,
  farmer_user_id TEXT NOT NULL REFERENCES users (id),
  direction      TEXT NOT NULL CHECK (direction IN ('collect', 'payout')),
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL CHECK (currency IN ('GHS', 'NGN', 'KES')),
  network        TEXT NOT NULL,
  phone_e164     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  -- 'votex365' for real test-mode checkouts; 'simulated' where the provider cannot help (payouts, NGN, KES).
  provider       TEXT NOT NULL CHECK (provider IN ('votex365', 'simulated')),
  provider_ref   TEXT,
  checkout_url   TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT NOT NULL,
  updated_by     TEXT
);

CREATE INDEX payments_farmer_idx ON payments (farmer_user_id);
CREATE UNIQUE INDEX payments_provider_ref_key ON payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE loan_requests (
  seq            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id             TEXT GENERATED ALWAYS AS ('L-' || seq) STORED UNIQUE,
  client_id      UUID NOT NULL CONSTRAINT loan_requests_client_id_key UNIQUE,
  farmer_user_id TEXT NOT NULL REFERENCES users (id),
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL CHECK (currency IN ('GHS', 'NGN', 'KES')),
  purpose        TEXT NOT NULL CHECK (length(purpose) BETWEEN 1 AND 200),
  status         TEXT NOT NULL DEFAULT 'received',
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT NOT NULL,
  updated_by     TEXT
);

-- Crop checks (ADVICE-CONTRACT) --------------------------------------------------------------------

CREATE TABLE crop_checks (
  seq              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id               TEXT GENERATED ALWAYS AS ('CC-' || seq) STORED UNIQUE,
  client_id        UUID NOT NULL CONSTRAINT crop_checks_client_id_key UNIQUE,
  farmer_user_id   TEXT NOT NULL REFERENCES users (id),
  crop             TEXT NOT NULL CHECK (crop IN ('maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain')),
  note             TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 500),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  photo_object_key TEXT,
  advice_text      TEXT,
  advice_by        TEXT,
  advice_by_user   TEXT REFERENCES users (id),
  advice_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       TEXT NOT NULL,
  updated_by       TEXT
);

-- Listings (LISTINGS-CONTRACT) ---------------------------------------------------------------------

CREATE TABLE listings (
  seq            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id             TEXT GENERATED ALWAYS AS ('LS-' || seq) STORED UNIQUE,
  client_id      UUID NOT NULL CONSTRAINT listings_client_id_key UNIQUE,
  seller_user_id TEXT NOT NULL REFERENCES users (id),
  crop           TEXT NOT NULL CHECK (crop IN ('maize', 'tomato', 'cassava', 'pepper', 'okro', 'yam', 'cocoa', 'plantain')),
  quantity_kg    NUMERIC NOT NULL CHECK (quantity_kg > 0 AND quantity_kg <= 100000),
  price_per_kg   NUMERIC(12, 2) NOT NULL CHECK (price_per_kg > 0),
  currency       TEXT NOT NULL CHECK (currency IN ('GHS', 'NGN', 'KES')),
  community      TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT NOT NULL,
  updated_by     TEXT
);

-- Audit log (DATA-CONTRACT §5, ADMIN-CONTRACT "Audit log") ----------------------------------------

CREATE TABLE audit_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  -- 'APP' marks events that are not row changes, such as a CSV export.
  action     TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'APP')),
  -- What the admin screen shows: agent.approve, farmers.insert, export.farmers, ...
  event      TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  old_data   JSONB,
  new_data   JSONB,
  changed_by TEXT NOT NULL DEFAULT current_user,
  app_actor  TEXT,
  actor_role TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  -- Secrets never reach the log; login bookkeeping is not worth a row.
  hidden   TEXT[] := ARRAY['pin_hash', 'password_hash'];
  noise    TEXT[] := ARRAY['updated_at', 'updated_by', 'failed_attempts', 'locked_until'];
  old_full JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  new_full JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  old_data JSONB := old_full - hidden;
  new_data JSONB := new_full - hidden;
  changes  TEXT;
  event    TEXT := TG_TABLE_NAME || '.' || lower(TG_OP);
  verb     TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT string_agg(format('%s: %s → %s', n.key, coalesce(o.value #>> '{}', '∅'), coalesce(n.value #>> '{}', '∅')), ', ' ORDER BY n.key)
      INTO changes
      FROM jsonb_each(new_data) AS n
      LEFT JOIN jsonb_each(old_data) AS o ON o.key = n.key
     WHERE n.value IS DISTINCT FROM o.value AND NOT n.key = ANY (noise);

    IF old_full ->> 'pin_hash' IS DISTINCT FROM new_full ->> 'pin_hash' THEN
      changes := concat_ws(', ', changes, 'PIN changed');
    END IF;
    IF old_full ->> 'password_hash' IS DISTINCT FROM new_full ->> 'password_hash' THEN
      changes := concat_ws(', ', changes, 'password changed');
    END IF;
    IF changes IS NULL THEN
      RETURN NULL;
    END IF;

    -- ADMIN-CONTRACT: a staff status change is named after the admin action that caused it.
    IF TG_TABLE_NAME = 'users' AND old_data ->> 'status' IS DISTINCT FROM new_data ->> 'status' THEN
      verb := CASE concat(old_data ->> 'status', '>', new_data ->> 'status')
        WHEN 'pending>approved' THEN 'approve'
        WHEN 'pending>rejected' THEN 'reject'
        WHEN 'approved>suspended' THEN 'suspend'
        WHEN 'suspended>approved' THEN 'reinstate'
      END;
      IF verb IS NOT NULL AND new_data ->> 'role' IN ('agent', 'coordinator') THEN
        event := (new_data ->> 'role') || '.' || verb;
      END IF;
    END IF;
  END IF;

  INSERT INTO audit_log (table_name, record_id, action, event, detail, old_data, new_data, app_actor, actor_role)
  VALUES (TG_TABLE_NAME, coalesce(new_data ->> 'id', old_data ->> 'id', new_data ->> 'farmer_id', old_data ->> 'farmer_id'),
          TG_OP, event, coalesce(changes, ''), old_data, new_data, current_actor(), current_actor_role());
  RETURN NULL;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'farmers', 'farmer_crops', 'payments', 'loan_requests', 'crop_checks', 'listings'] LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
    EXECUTE format('CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row()', t, t);
  END LOOP;
END $$;
