-- VELOX production schema — PostgreSQL 15+ with PostGIS.
-- Mirrors server/src/db/migrations/001_init.sql (SQLite, used for local development) with production-grade types:
--   * timestamptz for all times, bigint money in rupiah, geography(Point) + GIST indexes for spatial search
--   * an EXCLUDE constraint that makes overlapping active bookings for the same vehicle impossible at the database level
-- Apply with your migration tool of choice (e.g. node-pg-migrate, Flyway). Swap-over notes: docs/ARCHITECTURE.md §7.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- needed for EXCLUDE with "=" on vehicle_id
CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────── Enums ─────────────
CREATE TYPE location_type      AS ENUM ('country','province','city','district','neighborhood');
CREATE TYPE user_role          AS ENUM ('renter','owner','admin');
CREATE TYPE user_status        AS ENUM ('active','suspended');
CREATE TYPE app_locale         AS ENUM ('en','id','jv','fa');
CREATE TYPE verification_type  AS ENUM ('identity','driving_license','student');
CREATE TYPE review_status      AS ENUM ('pending','approved','rejected');
CREATE TYPE vehicle_category   AS ENUM ('bicycle','motorcycle');
CREATE TYPE vehicle_type       AS ENUM ('mountain','city','road','folding','electric_bicycle','student','scooter','automatic','manual','electric_motorcycle');
CREATE TYPE vehicle_condition  AS ENUM ('new','excellent','good','fair');
CREATE TYPE vehicle_status     AS ENUM ('draft','active','paused','maintenance','suspended','pending_review');
CREATE TYPE registration_state AS ENUM ('not_required','pending','approved','rejected');
CREATE TYPE booking_status     AS ENUM ('pending','accepted','confirmed','active','completed','rejected','cancelled','expired');
CREATE TYPE payment_status     AS ENUM ('pending','succeeded','failed','expired','refunded','partially_refunded');
CREATE TYPE payment_method     AS ENUM ('qris','bank_transfer','ewallet','card');
CREATE TYPE ledger_type        AS ENUM ('renter_charge','deposit_hold','deposit_release','deposit_capture','owner_earning','platform_commission','refund','late_fee','payout');
CREATE TYPE earning_status     AS ENUM ('pending','available','paid_out','reversed');

-- ───────────── Locations & universities ─────────────
CREATE TABLE locations (
  id                 bigserial PRIMARY KEY,
  parent_id          bigint REFERENCES locations(id) ON DELETE RESTRICT,
  type               location_type NOT NULL,
  name               text NOT NULL,
  slug               text NOT NULL UNIQUE,
  center             geography(Point, 4326),
  boundary           geography(MultiPolygon, 4326),        -- optional admin boundary for "vehicles in this district"
  utc_offset_minutes smallint NOT NULL DEFAULT 420 CHECK (utc_offset_minutes IN (420, 480, 540)),
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_locations_parent ON locations(parent_id);
CREATE INDEX idx_locations_center ON locations USING gist(center);

CREATE TABLE universities (
  id           bigserial PRIMARY KEY,
  city_id      bigint NOT NULL REFERENCES locations(id),
  name         text NOT NULL,
  short_name   text NOT NULL,
  slug         text NOT NULL UNIQUE,
  email_domain text,
  campus       geography(Point, 4326) NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_universities_campus ON universities USING gist(campus);

-- ───────────── Users ─────────────
CREATE TABLE users (
  id                bigserial PRIMARY KEY,
  email             citext NOT NULL UNIQUE,
  phone             text UNIQUE,
  password_hash     text NOT NULL,
  role              user_role NOT NULL DEFAULT 'renter',
  status            user_status NOT NULL DEFAULT 'active',
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  is_demo           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  user_id             bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name           text NOT NULL,
  avatar_url          text,
  date_of_birth       date,
  city_id             bigint REFERENCES locations(id),
  university_id       bigint REFERENCES universities(id),
  university_verified boolean NOT NULL DEFAULT false,
  bio                 text,
  locale              app_locale NOT NULL DEFAULT 'en',
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_university ON user_profiles(university_id);

CREATE TABLE sessions (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE verification_codes (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('email','phone')),
  code_hash  text NOT NULL,
  attempts   smallint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_verifications (
  id              bigserial PRIMARY KEY,
  user_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            verification_type NOT NULL,
  status          review_status NOT NULL DEFAULT 'pending',
  document_number text,                -- masked: last 4 characters only (data minimisation, UU PDP)
  license_class   text,
  expires_on      date,
  document_key    text,                -- key in the PRIVATE object-storage bucket
  reviewer_id     bigint REFERENCES users(id),
  review_note     text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verif_user ON user_verifications(user_id, type);
CREATE INDEX idx_verif_pending ON user_verifications(created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX uq_one_pending_verification ON user_verifications(user_id, type) WHERE status = 'pending';

-- ───────────── Vehicles ─────────────
CREATE TABLE vehicles (
  id                   bigserial PRIMARY KEY,
  owner_id             bigint NOT NULL REFERENCES users(id),
  category             vehicle_category NOT NULL,
  type                 vehicle_type NOT NULL,
  name                 text NOT NULL,
  brand                text NOT NULL,
  model                text NOT NULL,
  year                 smallint,
  description          text NOT NULL DEFAULT '',
  condition            vehicle_condition NOT NULL DEFAULT 'good',
  rules                text NOT NULL DEFAULT '',
  deposit              bigint NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  city_id              bigint NOT NULL REFERENCES locations(id),
  university_id        bigint REFERENCES universities(id),
  pickup_address       text NOT NULL,
  pickup_point         geography(Point, 4326) NOT NULL,
  plate_number         text,
  registration_doc_key text,
  registration_status  registration_state NOT NULL DEFAULT 'not_required',
  insurance_note       text,
  status               vehicle_status NOT NULL DEFAULT 'active',
  instant_book         boolean NOT NULL DEFAULT false,
  rating_avg           numeric(3,2) NOT NULL DEFAULT 0,
  rating_count         integer NOT NULL DEFAULT 0,
  is_demo              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moto_needs_registration CHECK (category = 'bicycle' OR registration_status <> 'not_required'),
  CONSTRAINT type_matches_category CHECK (
    (category = 'bicycle' AND type IN ('mountain','city','road','folding','electric_bicycle','student')) OR
    (category = 'motorcycle' AND type IN ('scooter','automatic','manual','electric_motorcycle')))
);
CREATE INDEX idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX idx_vehicles_point ON vehicles USING gist(pickup_point) WHERE status = 'active';   -- ST_DWithin search
CREATE INDEX idx_vehicles_filters ON vehicles(status, category, city_id);
CREATE INDEX idx_vehicles_university ON vehicles(university_id) WHERE status = 'active';

CREATE TABLE vehicle_images (
  id         bigserial PRIMARY KEY,
  vehicle_id bigint NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url        text NOT NULL,
  position   smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vimages_vehicle ON vehicle_images(vehicle_id, position);

CREATE TABLE vehicle_pricing (
  id               bigserial PRIMARY KEY,
  vehicle_id       bigint NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  duration_minutes integer NOT NULL CHECK (duration_minutes IN (30,60,120,180,360,720,1440)),
  price            bigint NOT NULL CHECK (price > 0),
  UNIQUE (vehicle_id, duration_minutes)
);

CREATE TABLE vehicle_availability (
  id           bigserial PRIMARY KEY,
  vehicle_id   bigint NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('weekly','block')),
  weekday      smallint CHECK (weekday BETWEEN 0 AND 6),
  start_minute smallint CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute   smallint CHECK (end_minute BETWEEN 0 AND 1440),
  block_period tstzrange,
  note         text,
  CHECK ((kind = 'weekly' AND weekday IS NOT NULL AND start_minute < end_minute) OR (kind = 'block' AND block_period IS NOT NULL))
);
CREATE INDEX idx_vavail_blocks ON vehicle_availability USING gist(vehicle_id, block_period) WHERE kind = 'block';

CREATE TABLE saved_vehicles (
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id bigint NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vehicle_id)
);

-- ───────────── Bookings ─────────────
CREATE TABLE bookings (
  id              bigserial PRIMARY KEY,
  code            text NOT NULL UNIQUE,
  vehicle_id      bigint NOT NULL REFERENCES vehicles(id),
  renter_id       bigint NOT NULL REFERENCES users(id),
  owner_id        bigint NOT NULL REFERENCES users(id),
  period          tstzrange NOT NULL,                     -- [start, end)
  status          booking_status NOT NULL,
  subtotal        bigint NOT NULL,
  deposit         bigint NOT NULL DEFAULT 0,
  late_fee        bigint NOT NULL DEFAULT 0,
  extension_total bigint NOT NULL DEFAULT 0,
  total           bigint NOT NULL,
  commission_rate numeric(5,4) NOT NULL,                  -- snapshot at booking time
  price_breakdown jsonb NOT NULL,
  renter_note     text,
  pickup_code     text NOT NULL,
  expires_at      timestamptz,
  picked_up_at    timestamptz,
  returned_at     timestamptz,
  cancelled_by    bigint REFERENCES users(id),
  cancel_reason   text,
  refund_amount   bigint NOT NULL DEFAULT 0,
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (renter_id <> owner_id),
  CHECK (NOT isempty(period)),
  -- The database itself refuses overlapping holds on the same vehicle (double-booking is impossible even under races).
  CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)
    WHERE (status IN ('pending','accepted','confirmed','active'))
);
CREATE INDEX idx_bookings_renter ON bookings(renter_id, status);
CREATE INDEX idx_bookings_owner ON bookings(owner_id, status);
CREATE INDEX idx_bookings_expiry ON bookings(expires_at) WHERE status IN ('pending','accepted');

CREATE TABLE booking_status_history (
  id          bigserial PRIMARY KEY,
  booking_id  bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status booking_status,
  to_status   booking_status NOT NULL,
  actor_id    bigint REFERENCES users(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bsh_booking ON booking_status_history(booking_id);

-- Allowed transitions, enforced in the database as a second line of defence behind the service layer.
CREATE TABLE booking_transitions (from_status booking_status, to_status booking_status, PRIMARY KEY (from_status, to_status));
INSERT INTO booking_transitions VALUES
  ('pending','accepted'),('pending','rejected'),('pending','cancelled'),('pending','expired'),
  ('accepted','confirmed'),('accepted','cancelled'),('accepted','expired'),
  ('confirmed','active'),('confirmed','cancelled'),('active','completed');

CREATE FUNCTION enforce_booking_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> OLD.status AND NOT EXISTS (
       SELECT 1 FROM booking_transitions WHERE from_status = OLD.status AND to_status = NEW.status) THEN
    RAISE EXCEPTION 'invalid booking transition % -> %', OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_booking_transition BEFORE UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION enforce_booking_transition();

CREATE TABLE handover_checklists (
  id           bigserial PRIMARY KEY,
  booking_id   bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  stage        text NOT NULL CHECK (stage IN ('pickup','return')),
  submitted_by bigint NOT NULL REFERENCES users(id),
  items        jsonb NOT NULL,
  condition_ok boolean NOT NULL,
  notes        text,
  photo_urls   jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, stage)
);

CREATE TABLE booking_extensions (
  id         bigserial PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_end_at timestamptz NOT NULL,
  new_end_at timestamptz NOT NULL,
  amount     bigint NOT NULL,
  status     text NOT NULL CHECK (status IN ('awaiting_payment','applied','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rental_agreements (
  id                 bigserial PRIMARY KEY,
  booking_id         bigint NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  version            text NOT NULL,
  content_hash       text NOT NULL,
  renter_accepted_at timestamptz NOT NULL,
  owner_accepted_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Money ─────────────
CREATE TABLE payments (
  id           bigserial PRIMARY KEY,
  booking_id   bigint NOT NULL REFERENCES bookings(id),
  purpose      text NOT NULL CHECK (purpose IN ('booking','extension')),
  extension_id bigint REFERENCES booking_extensions(id),
  provider     text NOT NULL,
  provider_ref text NOT NULL UNIQUE,                     -- idempotency key for webhooks
  method       payment_method NOT NULL,
  amount       bigint NOT NULL CHECK (amount > 0),
  status       payment_status NOT NULL,
  is_test      boolean NOT NULL DEFAULT true,
  raw_event    jsonb,
  confirmed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_booking ON payments(booking_id);

CREATE TABLE transactions (                              -- append-only ledger
  id          bigserial PRIMARY KEY,
  booking_id  bigint REFERENCES bookings(id),
  payment_id  bigint REFERENCES payments(id),
  user_id     bigint REFERENCES users(id),
  type        ledger_type NOT NULL,
  amount      bigint NOT NULL CHECK (amount >= 0),
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_booking ON transactions(booking_id);
CREATE INDEX idx_tx_user ON transactions(user_id, type);
CREATE RULE transactions_no_update AS ON UPDATE TO transactions DO INSTEAD NOTHING;
CREATE RULE transactions_no_delete AS ON DELETE TO transactions DO INSTEAD NOTHING;

CREATE TABLE owner_earnings (
  id         bigserial PRIMARY KEY,
  owner_id   bigint NOT NULL REFERENCES users(id),
  booking_id bigint NOT NULL UNIQUE REFERENCES bookings(id),
  gross      bigint NOT NULL,
  commission bigint NOT NULL,
  net        bigint NOT NULL,
  status     earning_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_earnings_owner ON owner_earnings(owner_id, status);

CREATE TABLE platform_commissions (
  id             bigserial PRIMARY KEY,
  rate           numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 0.5),
  category       vehicle_category,
  effective_from timestamptz NOT NULL,
  created_by     bigint REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

-- ───────────── Communication & trust ─────────────
CREATE TABLE conversations (
  id              bigserial PRIMARY KEY,
  vehicle_id      bigint NOT NULL REFERENCES vehicles(id),
  renter_id       bigint NOT NULL REFERENCES users(id),
  owner_id        bigint NOT NULL REFERENCES users(id),
  booking_id      bigint REFERENCES bookings(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, renter_id)
);

CREATE TABLE messages (
  id              bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       bigint NOT NULL REFERENCES users(id),
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, id);

CREATE TABLE reviews (
  id              bigserial PRIMARY KEY,
  booking_id      bigint NOT NULL REFERENCES bookings(id),
  author_id       bigint NOT NULL REFERENCES users(id),
  subject_user_id bigint NOT NULL REFERENCES users(id),
  vehicle_id      bigint REFERENCES vehicles(id),
  direction       text NOT NULL CHECK (direction IN ('renter_to_owner','owner_to_renter')),
  rating          smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text,
  is_demo         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, author_id)
);

CREATE TABLE reports (
  id          bigserial PRIMARY KEY,
  reporter_id bigint NOT NULL REFERENCES users(id),
  target_type text NOT NULL CHECK (target_type IN ('user','vehicle','booking','message')),
  target_id   bigint NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('fraud','unsafe','inaccurate','harassment','damage','other')),
  details     text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolution  text,
  handled_by  bigint REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE disputes (
  id             bigserial PRIMARY KEY,
  booking_id     bigint NOT NULL REFERENCES bookings(id),
  opened_by      bigint NOT NULL REFERENCES users(id),
  reason         text NOT NULL CHECK (reason IN ('damage','late_return','not_as_described','no_show','payment','other')),
  details        text,
  claimed_amount bigint NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved_renter','resolved_owner','closed')),
  resolution     text,
  handled_by     bigint REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  link       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    bigint REFERENCES users(id),
  action      text NOT NULL,
  target_type text,
  target_id   bigint,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Example spatial query (search within 2 km, nearest first) ─────────────
-- SELECT v.*, ST_Distance(v.pickup_point, ST_MakePoint($lng, $lat)::geography) / 1000 AS distance_km
-- FROM vehicles v
-- WHERE v.status = 'active' AND ST_DWithin(v.pickup_point, ST_MakePoint($lng, $lat)::geography, 2000)
-- ORDER BY v.pickup_point <-> ST_MakePoint($lng, $lat)::geography
-- LIMIT 12 OFFSET $offset;
