PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fishing_portal_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fishing_portal_audit (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fishing_portal_audit_booking_time
  ON fishing_portal_audit(booking_id, created_at DESC);
