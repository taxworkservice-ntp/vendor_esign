-- Best-effort: re-adding fails if any platform events (user_id='PLATFORM') exist.
ALTER TABLE audit_events ADD CONSTRAINT audit_events_tenant_id_fkey
  FOREIGN KEY (user_id) REFERENCES client_profiles(id);
