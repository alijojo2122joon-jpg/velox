# VELOX — Architecture & Delivery Notes

## 1. Requirements analysis (what matters most)

| Area | Decision / interpretation |
|---|---|
| Core loop | Owner lists → renter finds by location → requests → owner accepts → renter pays → code-verified pickup → return checklist → reviews. Built and tested end-to-end. |
| Booking engine | Durations from 30 min to 30 days. Owners publish price tiers (30m, 1h, 2h, 3h, 6h, 12h, 24h); every duration is priced as the **cheapest combination of tiers** (unbounded knapsack over 30-min units) so multi-day uses the daily tier automatically. |
| Double booking | Impossible: overlap check + insert run inside one write-locked transaction (SQLite `BEGIN IMMEDIATE`); in PostgreSQL an `EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)` constraint enforces it at the database level. |
| Motorcycles | Server-side eligibility on every motorcycle booking: verified email + phone, approved ID, approved and unexpired **SIM C**, age ≥ platform minimum (default **18**, admin-configurable; Indonesian law issues SIM C from 17). Motorcycle listings require plate + STNK and go live only after admin review. |
| Payments | Provider abstraction; booking is confirmed **only** by a signature-verified provider event (webhook). The mock provider uses the same path (server signs and verifies its own simulated webhook). Late payments after expiry are auto-refunded. |
| Money | Integer rupiah. Append-only ledger (`transactions`), per-booking `owner_earnings` (pending → available → paid_out / reversed), commission rate snapshotted on each booking, rate history in `platform_commissions`. |
| i18n | 4 locales in JSON files (en default, id, jv, fa). No UI strings in components; server returns **error codes**, notifications are stored as **type + params**, so every user sees text in their own language. Persian switches `<html dir="rtl">`; all layout uses logical properties (`ms/me/ps/pe/start/end`), directional icons flip. Preference saved locally and on the profile. Persian dates use the Gregorian calendar (bookings happen in Indonesia). |
| Scale | Paginated (12/page) location-bounded search, bounding-box prefilter + exact distance, indexes on all hot paths, lazy-loaded routes and locales, client-side image compression, gzip + immutable caching of hashed assets. |
| Honesty | Demo data flagged `is_demo` and labelled; payments, verification codes and document review clearly marked as demo; unfinished features say "Coming soon" (QR pickup, payouts, data export, translation editor). |

## 2. Architecture

```
Browser (React SPA, code-split)  ──HTTPS/JSON──▶  Node.js API (TypeScript)
   i18n JSON locales                                ├─ auth (scrypt, httpOnly session cookie, RBAC)
   Leaflet + OSM (lazy, CDN)                        ├─ vehicles / search (geo + availability)
                                                    ├─ booking engine (pricing, availability, state machine)
                                                    ├─ payments (provider interface → mock | Midtrans | Xendit)
                                                    ├─ notifications (in-app now; email/push channels pluggable)
                                                    ├─ messaging, reviews, reports, disputes
                                                    ├─ admin + audit log
                                                    └─ scheduled jobs (expiry, pickup/return reminders)
                                                         │
                         SQLite (dev) / PostgreSQL+PostGIS (prod)     Object storage: public (photos) / private (documents)
```

Security: security headers + CSP, SameSite=Lax httpOnly cookies + origin check on mutations, per-IP and per-action rate limits, zod validation on every input, magic-byte upload sniffing, private document bucket streamed only to admins (with audit entries), document numbers masked to last 4 chars, contact details masked in chat until a booking is confirmed, secrets only in server env.

## 3. Technology choices (and deviations from the brief)

The brief's stack is kept: **React + TypeScript + Tailwind** frontend, **Node.js + TypeScript** REST backend, **PostgreSQL + PostGIS** as the production database. Two deliberate substitutions, both easy to reverse:

1. **esbuild + Tailwind compiler instead of the Vite CLI.** Vite uses esbuild internally; calling esbuild directly gives the same output (ESM code-splitting, minification) with two dependencies. `scripts/build-web.mjs` is ~60 lines. Moving to Vite later = add `vite.config.ts` with `@vitejs/plugin-react` and `@tailwindcss/vite`; no source changes.
2. **A small Express-compatible router on `node:http` instead of Express.** Same shape (`r.get(path, ...handlers)`, `req.params/query/body`, middleware chain) — porting to Express or Fastify is mechanical. It keeps the server dependency-light (runtime deps: `zod` only).
3. **SQLite (Node 22 built-in) for local development**, PostgreSQL+PostGIS schema provided for production (`database/postgres/001_schema.sql`). This lets anyone run the full app with zero setup. All SQL lives in the service modules; see §7 for the migration path.

## 4. Database

Tables (all from the brief, plus a few needed for correctness): `users, user_profiles, sessions, verification_codes, user_verifications, universities, locations, vehicles, vehicle_images, vehicle_pricing, vehicle_availability, saved_vehicles, bookings, booking_status_history, handover_checklists, booking_extensions, rental_agreements, payments, transactions, owner_earnings, platform_commissions, platform_settings, conversations, messages, reviews, reports, disputes, notifications, audit_log`.

Booking state machine (enforced in the service layer; also by trigger in PostgreSQL):

```
pending ─accept→ accepted ─payment confirmed→ confirmed ─pickup code + checklist→ active ─return checklist→ completed
   ├─reject→ rejected      ├─cancel→ cancelled              └─cancel (refund policy)→ cancelled
   ├─cancel→ cancelled     └─payment timeout→ expired
   └─owner timeout→ expired          (instant-book listings start at "accepted")
```

Rules (admin-configurable): owner response window 120 min, payment window 30 min, free cancellation ≥ 24 h before pickup (otherwise 50 % of rental refunded + full deposit; owner cancellation = full refund), 15 min late grace, late fee = started hours × hourly-equivalent × 1.5 (captured from deposit first), damage on return → dispute with deposit held.

## 5. API overview (REST, JSON)

Auth: `POST /api/auth/register|login|logout`, `GET /api/auth/me`, `POST /api/auth/verify/:channel/send|confirm`, `PATCH /api/me/profile`, `POST /api/me/verifications`, `POST /api/me/become-owner`.
Discovery: `GET /api/vehicles` (q, category, type, cityId, universityId, lat, lng, radiusKm, bounds, minPrice, maxPrice, minRating, start, end, availableNow, sort, page), `GET /api/vehicles/:id`, `GET /api/vehicles/:id/quote`, `GET /api/locations/cities`, `GET /api/universities[/:slug]`, `GET /api/stats`.
Owner: `GET /api/owner/vehicles`, `POST /api/vehicles`, `PATCH /api/vehicles/:id`, `PUT /api/vehicles/:id/pricing|availability`, `POST|DELETE /api/vehicles/:id/blocks[/:id]`, `POST|DELETE /api/vehicles/:id/images[/:id]`, `GET /api/owner/earnings`.
Bookings: `GET /api/bookings?as=renter|owner`, `GET /api/bookings/:id`, `POST /api/bookings`, `POST /api/bookings/:id/respond|pay|cancel|start|complete|extend|review|dispute`.
Payments: `GET /api/payments/:ref`, `POST /api/payments/webhook/:provider` (signed), `POST /api/payments/mock/:ref/simulate` (demo only, disabled when a real provider is set).
Community: `GET /api/conversations`, `GET|POST /api/conversations/:id/messages`, `POST /api/vehicles/:id/contact`, `POST /api/reports`, `GET /api/notifications`, saved vehicles.
Admin: overview, users, verifications (+ private document stream), vehicles (+ STNK), bookings, transactions, reports, disputes, settings, commissions, locations.

Errors: `{ "error": { "code": "ALREADY_BOOKED", "details": {...} } }`; validation errors return `details: { field: "V_EMAIL" }`.

## 6. External services that need accounts / API keys

| Service | Purpose | Options | Status |
|---|---|---|---|
| Payment gateway | QRIS, VA bank transfer, e-wallets, cards, refunds, payouts | **Midtrans** or **Xendit** (both need a registered Indonesian business: NIB, NPWP, bank account) | Mock provider in place; implement `PaymentProvider` |
| SMS / WhatsApp OTP | Phone verification | Twilio, Vonage, or a local gateway (e.g. Zenziva, Qontak) | Codes shown in a demo box |
| Email | Verification, receipts | AWS SES, SendGrid, Mailgun | Not connected |
| Object storage + CDN | Photos (public), ID/licence/STNK docs (private, encrypted) | AWS S3 / Cloudflare R2 / GCS — prefer an Indonesian region (data residency) | Local disk adapter |
| Maps / tiles | Map view | OpenStreetMap tiles are fine for development only; production needs a tile provider (MapTiler, Mapbox, Stadia) or self-hosted tiles | Leaflet + OSM, offline fallback |
| Geocoding (optional) | Address → coordinates | Google Places, Mapbox, Nominatim (self-hosted) | Manual coordinates / "use my location" |
| Push (Phase 3) | Mobile/web push | Firebase Cloud Messaging | Channel interface ready |
| KYC (optional) | Automated ID/selfie checks | Verihubs, VIDA, Privy | Manual admin review |

## 7. Moving to PostgreSQL + PostGIS

1. Apply `database/postgres/001_schema.sql`.
2. Replace `server/src/db/index.ts` with a `pg` pool exposing the same `q.all/get/run` + `tx()` helpers (async).
3. Change placeholders `?` → `$n`, and in `modules/vehicles.ts` replace the haversine expression with `ST_DWithin` / `ST_Distance` on `pickup_point` (example at the end of the schema file). Booking `start_at/end_at` become `period tstzrange`.
4. The EXCLUDE constraint then guarantees no double bookings even across multiple API instances; move the in-memory rate limiter to Redis.

## 8. Legal & operational dependencies (before public launch)

- **Company & licences**: PT entity, NIB via OSS; assess whether the platform needs PSE (Penyelenggara Sistem Elektronik) registration with Kominfo/Komdigi — required for private electronic system operators serving Indonesian users.
- **Personal data**: UU No. 27/2022 (PDP) — privacy policy, consent, data-processing records, breach procedure, retention rules, possibly a DPO; ID documents are sensitive data (encrypt at rest, restrict access, audit).
- **Payments**: use a licensed PJP gateway; VELOX should not hold customer funds itself unless licensed — use the gateway's escrow/split-payment or disbursement products for owner payouts.
- **Motorcycle rentals**: confirm requirements with a lawyer — peer-to-peer rental of private motorcycles (plat hitam), insurance/liability for third-party damage, SIM C validity for foreigners (international permit), helmet (SNI) obligations, tax on owner income.
- **Consumer protection**: clear terms, cancellation/refund policy, complaint channel (UU Perlindungan Konsumen).
- **Rental agreement**: the in-app agreement is a draft and must be reviewed by an Indonesian lawyer.
- **Operations**: dispute handling SLA, fraud monitoring, support channel (WhatsApp Business), insurance partner.

## 9. Delivery status

### Done (tested)
Homepage · registration/login · 4 languages incl. full RTL Persian · renter dashboard (active/upcoming, history, to-review, saved, payments) · owner dashboard (overview & monthly chart, requests, bookings, vehicles with pause/maintenance, 14-day calendar with date blocks, earnings & ledger) · marketplace with bicycles and motorcycles · motorcycle eligibility enforcement · vehicle detail with gallery, prices, handover hours, busy dates, map, reviews · smart search (city, university, near-me radius, type, price, rating, availability window, 5 sort orders, map/list, pagination) · listing creation & editing (photos, tiers, weekly hours, deposit, instant book, STNK) · booking engine (request/instant, accept/reject, expiry, cancel policy, extensions, late fees) · mock payments via signed webhook · digital pickup/return checklists with photos + pickup code · reviews (two-way) · messaging with contact masking · reports & disputes with deposit awards · in-app notifications with reminders · university pages & dashboard · admin (overview, verification queue, users, vehicles/STNK approval, bookings, finance, reports/disputes, cities, settings, commission) · responsive desktop/tablet/mobile.

### Remaining / next
- Real payment gateway (Midtrans/Xendit), owner payouts, receipts.
- Real OTP delivery (SMS/WhatsApp, email); set `EXPOSE_DEV_CODES=false`.
- Cloud object storage + image resizing pipeline (thumbnails, WebP).
- PostgreSQL migration (§7) and deployment (Docker, CI, backups, monitoring).
- QR code at pickup (code flow exists), map-click location picker, geocoding.
- Email & push notification channels, data export/account deletion (PDP), in-dashboard translation editor.
- Native-speaker review of Javanese and Persian copy; legal review of the agreement.
- Fraud signals (velocity, device), automated KYC, insurance integration (Phase 3).
