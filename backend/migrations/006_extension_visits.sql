-- Extension agents "required to track farmer interactions and progress" (Prosit brief): one row per visit.
CREATE TABLE extension_visits (
  seq        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id         TEXT GENERATED ALWAYS AS ('EV-' || seq) STORED UNIQUE,
  client_id  UUID NOT NULL CONSTRAINT extension_visits_client_id_key UNIQUE,
  farmer_id  BIGINT NOT NULL REFERENCES farmers (id) ON DELETE CASCADE,
  agent_id   TEXT NOT NULL REFERENCES users (id),
  visited_at TIMESTAMPTZ NOT NULL,
  topics     TEXT[] NOT NULL CHECK (cardinality(topics) > 0 AND topics <@ ARRAY['advice', 'inputs', 'pests', 'market', 'training', 'credit', 'records', 'follow_up']),
  notes      TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  next_visit DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX extension_visits_farmer_idx ON extension_visits (farmer_id, visited_at DESC);

CREATE TRIGGER extension_visits_touch BEFORE UPDATE ON extension_visits FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER extension_visits_audit AFTER INSERT OR UPDATE OR DELETE ON extension_visits FOR EACH ROW EXECUTE FUNCTION audit_row();
