# VELOX — Move Freely. Earn Easily.

Peer-to-peer bicycle & motorcycle sharing marketplace for Indonesia. Starts with university communities, built for every city.

**Status:** Phase 1 MVP (working end-to-end) + core Phase 2 trust/payment features with a mock payment gateway. All seeded content is demo data and is labelled **Demo** in the UI.

## Run it (Node.js 22.14+ required — uses the built-in SQLite)

```bash
npm install
npm run build          # builds the frontend (web/dist) and the server bundle (dist/server.js)
npm start              # http://localhost:8080
```

Development: `npm run dev` (builds the web app once, then runs the API with auto-reload via tsx).
Reset demo data: `npm run db:reset`, then start again.

### Demo accounts (password `Demo1234!`)
| Role | Email | Notes |
|---|---|---|
| Renter | renter@velox.demo | Verified, has SIM C → can book motorcycles |
| Owner | owner@velox.demo | 4 listings in Yogyakarta, a pending request |
| Admin | admin@velox.demo | Verification queue, disputes, commission, cities |

The login page has one-click buttons for these.

## Tests
```bash
npm start &            # server must be running
npm test               # 20 API checks: register → list bike → search → book → double-booking blocked →
                       # accept → mock pay (signed webhook) → pickup code → extend → return → review,
                       # motorcycle eligibility, RBAC, commission
node scripts/check-i18n.mjs   # all 4 locales complete, placeholders consistent
```

## Project layout
```
server/src/
  index.ts              HTTP server, security headers, static files, error handling, scheduled jobs
  config.ts             environment configuration
  lib/                  router/validation (http.ts), logger/rate limit (util.ts), object storage (storage.ts)
  db/                   SQLite connection + migrations runner, migrations/, demo seed
  auth/                 password hashing, sessions, RBAC middleware, verification & eligibility
  modules/
    vehicles.ts         listings, search (geo + availability + filters), pricing/availability management
    bookings/           pricing engine, availability rules, state machine & service, routes
    payments/           provider abstraction + mock provider (Midtrans/Xendit plug in here)
    notifications.ts    in-app notifications + channel interface (email/push later)
    community.ts        messaging, reports, public profiles
    locations.ts        provinces/cities/universities, university dashboard, admin locations
    admin.ts            admin APIs + owner earnings
web/src/
  i18n/                 provider + locales/en|id|jv|fa.json (all UI text lives here)
  lib/                  api client, router, auth, formatting, hooks
  components/           design-system UI kit, layout, vehicle card, map
  pages/                Home, Search, VehicleDetail, Auth, BookingDetail, Pay, dashboards, Admin, …
database/postgres/      production PostgreSQL + PostGIS schema
docs/ARCHITECTURE.md    requirements analysis, architecture, decisions, external services, legal checklist, roadmap
```

See **docs/ARCHITECTURE.md** for the full design and the list of remaining work.
