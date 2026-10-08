-- Follow-up to 001/002: the indexes the admin and list queries rely on, and an explicit ON DELETE
-- policy. Nothing in the API deletes a user or a farmer, so references onto users and associations
-- become RESTRICT: a delete fails loudly instead of silently orphaning history. The two intentional
-- CASCADEs (farmer_crops, agent_sync_status) are left alone.

CREATE INDEX audit_log_target_idx ON audit_log (table_name, record_id);
CREATE INDEX audit_log_changed_at_idx ON audit_log (changed_at DESC);
CREATE INDEX farmers_registered_at_idx ON farmers (registered_at DESC);
CREATE INDEX feedback_created_at_idx ON feedback (created_at DESC);
CREATE INDEX crop_checks_farmer_user_idx ON crop_checks (farmer_user_id);
CREATE INDEX crop_checks_status_idx ON crop_checks (status);
CREATE INDEX loan_requests_farmer_idx ON loan_requests (farmer_user_id);
CREATE INDEX listings_status_crop_idx ON listings (status, crop);

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass AS tbl,
           c.confrelid::regclass AS ref,
           a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND cardinality(c.conkey) = 1
       AND c.confrelid IN ('users'::regclass, 'associations'::regclass)
       AND c.confdeltype <> 'c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s (id) ON DELETE RESTRICT', r.tbl, r.conname, r.col, r.ref);
  END LOOP;
END $$;
