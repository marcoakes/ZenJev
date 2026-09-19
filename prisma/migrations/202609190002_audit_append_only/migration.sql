CREATE FUNCTION zenjev_prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION zenjev_prevent_audit_mutation();
