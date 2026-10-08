-- Feature-phone access (Prosit brief: "SMS/USSD integration for feature phone access").
-- USSD gateways send one key press per request, so the menu position lives here between requests.
CREATE TABLE ussd_sessions (
  session_id TEXT PRIMARY KEY,
  msisdn     TEXT NOT NULL,
  state      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ussd_sessions_updated_idx ON ussd_sessions (updated_at);

-- A farmer asking for help outside the app (USSD today), for coordinators and admins to follow up.
CREATE TABLE support_requests (
  seq          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id           TEXT GENERATED ALWAYS AS ('RQ-' || seq) STORED UNIQUE,
  phone_e164   TEXT NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  channel      TEXT NOT NULL CHECK (channel IN ('ussd', 'app')),
  kind         TEXT NOT NULL CHECK (kind IN ('agent_visit')),
  language     TEXT CHECK (language IN ('en', 'tw', 'ee', 'dag')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  handled_by   TEXT REFERENCES users (id),
  handled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT,
  updated_by   TEXT
);

CREATE INDEX support_requests_status_idx ON support_requests (status, seq DESC);

CREATE TRIGGER support_requests_touch BEFORE UPDATE ON support_requests FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER support_requests_audit AFTER INSERT OR UPDATE OR DELETE ON support_requests FOR EACH ROW EXECUTE FUNCTION audit_row();
