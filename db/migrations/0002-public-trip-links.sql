PRAGMA foreign_keys = ON;

ALTER TABLE bookings ADD COLUMN public_token TEXT;
ALTER TABLE bookings ADD COLUMN public_link_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN public_link_created_at TEXT;
ALTER TABLE bookings ADD COLUMN public_link_revoked_at TEXT;
ALTER TABLE bookings ADD COLUMN public_notes TEXT;

ALTER TABLE contacts ADD COLUMN vehicle_model TEXT;
ALTER TABLE contacts ADD COLUMN vehicle_plate TEXT;
ALTER TABLE contacts ADD COLUMN public_notes TEXT;

UPDATE bookings
SET public_token = lower(hex(randomblob(12))),
    public_link_created_at = COALESCE(public_link_created_at, CURRENT_TIMESTAMP)
WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_public_token
ON bookings(public_token)
WHERE public_token IS NOT NULL;
