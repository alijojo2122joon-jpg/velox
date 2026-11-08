-- VELOX development schema (SQLite).
-- Mirrors database/postgres/001_schema.sql, which is the production schema (PostgreSQL + PostGIS).
-- Timestamps are ISO-8601 UTC strings. Money is stored as INTEGER rupiah (IDR has no minor unit in practice).

PRAGMA foreign_keys = ON;

-- ───────────── Locations & universities ─────────────
CREATE TABLE locations (
  id          INTEGER PRIMARY KEY,
  parent_id   INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
  type        TEXT NOT NULL CHECK (type IN ('country','province','city','district','neighborhood')),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  lat         REAL,
  lng         REAL,
  utc_offset_minutes INTEGER NOT NULL DEFAULT 420,  -- WIB +7 (420), WITA +8 (480), WIT +9 (540)
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_locations_parent ON locations(parent_id);
CREATE INDEX idx_locations_type ON locations(type);

CREATE TABLE universities (
  id          INTEGER PRIMARY KEY,
  city_id     INTEGER NOT NULL REFERENCES locations(id),
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  email_domain TEXT,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_universities_city ON universities(city_id);

-- ───────────── Users ─────────────
CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone          TEXT UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'renter' CHECK (role IN ('renter','owner','admin')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  email_verified_at TEXT,
  phone_verified_at TEXT,
  is_demo        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE user_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name      TEXT NOT NULL,
  avatar_url     TEXT,
  date_of_birth  TEXT,
  city_id        INTEGER REFERENCES locations(id),
  university_id  INTEGER REFERENCES universities(id),
  university_verified INTEGER NOT NULL DEFAULT 0,
  bio            TEXT,
  locale         TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','id','jv','fa')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_profiles_university ON user_profiles(university_id);

CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- One-time codes for email / phone verification (hashed).
CREATE TABLE verification_codes (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('email','phone')),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_vcodes_user ON verification_codes(user_id, channel);

-- Identity / licence / registration documents reviewed by admins.
CREATE TABLE user_verifications (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('identity','driving_license','student')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  document_number TEXT,
  license_class TEXT,
  expires_on    TEXT,
  document_key  TEXT,
  reviewer_id   INTEGER REFERENCES users(id),
  review_note   TEXT,
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_verif_user ON user_verifications(user_id, type);
CREATE INDEX idx_verif_status ON user_verifications(status);

-- ───────────── Vehicles ─────────────
CREATE TABLE vehicles (
  id              INTEGER PRIMARY KEY,
  owner_id        INTEGER NOT NULL REFERENCES users(id),
  category        TEXT NOT NULL CHECK (category IN ('bicycle','motorcycle')),
  type            TEXT NOT NULL CHECK (type IN ('mountain','city','road','folding','electric_bicycle','student',
                                               'scooter','automatic','manual','electric_motorcycle')),
  name            TEXT NOT NULL,
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  year            INTEGER,
  description     TEXT NOT NULL DEFAULT '',
  condition       TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('new','excellent','good','fair')),
  rules           TEXT NOT NULL DEFAULT '',
  deposit         INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  city_id         INTEGER NOT NULL REFERENCES locations(id),
  university_id   INTEGER REFERENCES universities(id),
  pickup_address  TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  -- Motorcycle-only documentation (STNK = vehicle registration certificate)
  plate_number    TEXT,
  registration_doc_key TEXT,
  registration_status TEXT NOT NULL DEFAULT 'not_required'
                    CHECK (registration_status IN ('not_required','pending','approved','rejected')),
  insurance_note  TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft','active','paused','maintenance','suspended','pending_review')),
  instant_book    INTEGER NOT NULL DEFAULT 0,
  rating_avg      REAL NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX idx_vehicles_search ON vehicles(status, category, city_id);
CREATE INDEX idx_vehicles_geo ON vehicles(lat, lng);
CREATE INDEX idx_vehicles_university ON vehicles(university_id);

CREATE TABLE vehicle_images (
  id          INTEGER PRIMARY KEY,
  vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_vimages_vehicle ON vehicle_images(vehicle_id, position);

-- Owner-configured price tiers. duration_minutes 1440 = 24h; the daily tier also prices multi-day rentals.
CREATE TABLE vehicle_pricing (
  id               INTEGER PRIMARY KEY,
  vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (30,60,120,180,360,720,1440)),
  price            INTEGER NOT NULL CHECK (price > 0),
  UNIQUE (vehicle_id, duration_minutes)
);

-- Weekly handover windows (local time, minutes from midnight) and date blocks.
CREATE TABLE vehicle_availability (
  id            INTEGER PRIMARY KEY,
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('weekly','block')),
  weekday       INTEGER CHECK (weekday BETWEEN 0 AND 6),
  start_minute  INTEGER CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute    INTEGER CHECK (end_minute BETWEEN 0 AND 1440),
  block_start   TEXT,
  block_end     TEXT,
  note          TEXT,
  CHECK ((kind = 'weekly' AND weekday IS NOT NULL AND start_minute < end_minute)
      OR (kind = 'block' AND block_start IS NOT NULL AND block_end > block_start))
);
CREATE INDEX idx_vavail_vehicle ON vehicle_availability(vehicle_id, kind);

CREATE TABLE saved_vehicles (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, vehicle_id)
);

-- ───────────── Bookings ─────────────
CREATE TABLE bookings (
  id               INTEGER PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id),
  renter_id        INTEGER NOT NULL REFERENCES users(id),
  owner_id         INTEGER NOT NULL REFERENCES users(id),
  start_at         TEXT NOT NULL,
  end_at           TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('pending','accepted','confirmed','active','completed',
                                                   'rejected','cancelled','expired')),
  subtotal         INTEGER NOT NULL,
  deposit          INTEGER NOT NULL DEFAULT 0,
  late_fee         INTEGER NOT NULL DEFAULT 0,
  extension_total  INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  commission_rate  REAL NOT NULL,
  price_breakdown  TEXT NOT NULL,
  renter_note      TEXT,
  pickup_code      TEXT NOT NULL,
  expires_at       TEXT,
  picked_up_at     TEXT,
  returned_at      TEXT,
  cancelled_by     INTEGER REFERENCES users(id),
  cancel_reason    TEXT,
  refund_amount    INTEGER NOT NULL DEFAULT 0,
  is_demo          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_at > start_at)
);
CREATE INDEX idx_bookings_vehicle_time ON bookings(vehicle_id, start_at, end_at);
CREATE INDEX idx_bookings_renter ON bookings(renter_id, status);
CREATE INDEX idx_bookings_owner ON bookings(owner_id, status);
CREATE INDEX idx_bookings_expiry ON bookings(status, expires_at);

CREATE TABLE booking_status_history (
  id          INTEGER PRIMARY KEY,
  booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    INTEGER REFERENCES users(id),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_bsh_booking ON booking_status_history(booking_id);

-- Digital handover checklists (pickup & return) with timestamps.
CREATE TABLE handover_checklists (
  id           INTEGER PRIMARY KEY,
  booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL CHECK (stage IN ('pickup','return')),
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  items        TEXT NOT NULL,            -- JSON {tires:true, brakes:true, ...}
  condition_ok INTEGER NOT NULL,
  notes        TEXT,
  photo_urls   TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (booking_id, stage)
);

CREATE TABLE booking_extensions (
  id           INTEGER PRIMARY KEY,
  booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_end_at   TEXT NOT NULL,
  new_end_at   TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('awaiting_payment','applied','failed')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE rental_agreements (
  id            INTEGER PRIMARY KEY,
  booking_id    INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  renter_accepted_at TEXT NOT NULL,
  owner_accepted_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────────── Money ─────────────
CREATE TABLE payments (
  id               INTEGER PRIMARY KEY,
  booking_id       INTEGER NOT NULL REFERENCES bookings(id),
  purpose          TEXT NOT NULL CHECK (purpose IN ('booking','extension')),
  extension_id     INTEGER REFERENCES booking_extensions(id),
  provider         TEXT NOT NULL,
  provider_ref     TEXT NOT NULL UNIQUE,
  method           TEXT NOT NULL CHECK (method IN ('qris','bank_transfer','ewallet','card')),
  amount           INTEGER NOT NULL CHECK (amount > 0),
  status           TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','expired','refunded','partially_refunded')),
  is_test          INTEGER NOT NULL DEFAULT 1,
  raw_event        TEXT,
  confirmed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_payments_booking ON payments(booking_id);

-- Append-only double-entry style ledger. Positive amounts; direction implied by type.
CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY,
  booking_id   INTEGER REFERENCES bookings(id),
  payment_id   INTEGER REFERENCES payments(id),
  user_id      INTEGER REFERENCES users(id),
  type         TEXT NOT NULL CHECK (type IN ('renter_charge','deposit_hold','deposit_release','deposit_capture',
                                             'owner_earning','platform_commission','refund','late_fee','payout')),
  amount       INTEGER NOT NULL CHECK (amount >= 0),
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_tx_booking ON transactions(booking_id);
CREATE INDEX idx_tx_user ON transactions(user_id, type);

CREATE TABLE owner_earnings (
  id           INTEGER PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id),
  booking_id   INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  gross        INTEGER NOT NULL,
  commission   INTEGER NOT NULL,
  net          INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','available','paid_out','reversed')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_earnings_owner ON owner_earnings(owner_id, status);

-- Commission rate history: the newest row with effective_from <= now applies. Bookings snapshot the rate.
CREATE TABLE platform_commissions (
  id             INTEGER PRIMARY KEY,
  rate           REAL NOT NULL CHECK (rate >= 0 AND rate <= 0.5),
  category       TEXT CHECK (category IN ('bicycle','motorcycle')),
  effective_from TEXT NOT NULL,
  created_by     INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE platform_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────────── Communication & trust ─────────────
CREATE TABLE conversations (
  id          INTEGER PRIMARY KEY,
  booking_id  INTEGER REFERENCES bookings(id) ON DELETE SET NULL,  -- most recent booking in this thread
  vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id),
  renter_id   INTEGER NOT NULL REFERENCES users(id),
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  last_message_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_conv_pair ON conversations(vehicle_id, renter_id);
CREATE INDEX idx_conv_renter ON conversations(renter_id);
CREATE INDEX idx_conv_owner ON conversations(owner_id);

CREATE TABLE messages (
  id               INTEGER PRIMARY KEY,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER NOT NULL REFERENCES users(id),
  body             TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  read_at          TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, id);

CREATE TABLE reviews (
  id           INTEGER PRIMARY KEY,
  booking_id   INTEGER NOT NULL REFERENCES bookings(id),
  author_id    INTEGER NOT NULL REFERENCES users(id),
  subject_user_id INTEGER NOT NULL REFERENCES users(id),
  vehicle_id   INTEGER REFERENCES vehicles(id),
  direction    TEXT NOT NULL CHECK (direction IN ('renter_to_owner','owner_to_renter')),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  is_demo      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (booking_id, author_id)
);
CREATE INDEX idx_reviews_vehicle ON reviews(vehicle_id);
CREATE INDEX idx_reviews_subject ON reviews(subject_user_id);

CREATE TABLE reports (
  id            INTEGER PRIMARY KEY,
  reporter_id   INTEGER NOT NULL REFERENCES users(id),
  target_type   TEXT NOT NULL CHECK (target_type IN ('user','vehicle','booking','message')),
  target_id     INTEGER NOT NULL,
  reason        TEXT NOT NULL CHECK (reason IN ('fraud','unsafe','inaccurate','harassment','damage','other')),
  details       TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolution    TEXT,
  handled_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_reports_status ON reports(status);

CREATE TABLE disputes (
  id            INTEGER PRIMARY KEY,
  booking_id    INTEGER NOT NULL REFERENCES bookings(id),
  opened_by     INTEGER NOT NULL REFERENCES users(id),
  reason        TEXT NOT NULL CHECK (reason IN ('damage','late_return','not_as_described','no_show','payment','other')),
  details       TEXT,
  claimed_amount INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved_renter','resolved_owner','closed')),
  resolution    TEXT,
  handled_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_disputes_status ON disputes(status);

CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',   -- rendered client-side from locale files: never stored as prose
  link        TEXT,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

-- Admin audit trail for sensitive actions.
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  meta        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
