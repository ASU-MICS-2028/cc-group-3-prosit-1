-- feedback was the one append-only table the audit trigger list in 001 missed. It has no updated_at /
-- updated_by columns, so only the audit trigger is attached here (the touch trigger needs both).
CREATE TRIGGER feedback_audit AFTER INSERT ON feedback FOR EACH ROW EXECUTE FUNCTION audit_row();
