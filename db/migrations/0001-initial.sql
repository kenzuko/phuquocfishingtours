PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('partner','driver','captain','host','staff','other')),
  name TEXT NOT NULL,
  phone TEXT,
  zalo_phone TEXT,
  whatsapp TEXT,
  company TEXT,
  can_collect_cash INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contacts_kind_active ON contacts(kind, active, name);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  booking_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'inquiry' CHECK(status IN ('inquiry','hold','confirmed','ready','running','completed','cancelled')),
  service_date TEXT NOT NULL,
  tour_type TEXT,
  guests INTEGER,
  representative TEXT,
  phone TEXT,
  telegram TEXT,
  whatsapp TEXT,
  nationality TEXT,
  start_time TEXT,
  end_time TEXT,
  pickup_time TEXT,
  pickup_location TEXT,
  total_amount INTEGER,
  currency TEXT NOT NULL DEFAULT 'VND',
  payment_method TEXT NOT NULL DEFAULT 'unknown',
  payment_status TEXT NOT NULL DEFAULT 'due' CHECK(payment_status IN ('due','collected_by_partner','settled','waived')),
  cash_collector_contact_id TEXT,
  inclusions TEXT,
  notes TEXT,
  source_text TEXT,
  weather_status TEXT NOT NULL DEFAULT 'unknown' CHECK(weather_status IN ('unknown','go','hold','modify','cancel')),
  owner_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(cash_collector_contact_id) REFERENCES contacts(id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(service_date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_rep ON bookings(representative);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('boat_partner','driver_outbound','driver_return','captain','host','cash_collector')),
  contact_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','notified','confirmed','completed','cancelled')),
  last_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_booking_role ON assignments(booking_id, role) WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  assignment_id TEXT,
  reminder_type TEXT NOT NULL DEFAULT 'd1',
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','sent','done','skipped')),
  channel TEXT NOT NULL DEFAULT 'zalo',
  message TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reminders_due_status ON reminders(due_at, status);

CREATE TABLE IF NOT EXISTS booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_events_booking_time ON booking_events(booking_id, occurred_at DESC);
