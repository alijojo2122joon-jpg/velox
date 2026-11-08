import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, isProd } from './config.ts';
import { migrate, q } from './db/index.ts';
import { Router, ApiError, makeRes, parseCookies, readBody, type Req } from './lib/http.ts';
import { log, rateLimiter } from './lib/util.ts';
import { storage, mimeFor } from './lib/storage.ts';
import { loadUser, requireAuth } from './auth/middleware.ts';
import { authRoutes } from './auth/routes.ts';
import { locationRoutes } from './modules/locations.ts';
import { vehicleRoutes } from './modules/vehicles.ts';
import { bookingRoutes } from './modules/bookings/routes.ts';
import { runScheduledJobs } from './modules/bookings/service.ts';
import { notificationRoutes } from './modules/notifications.ts';
import { communityRoutes } from './modules/community.ts';
import { adminRoutes, ownerStatsRoutes } from './modules/admin.ts';
import { seedDemo } from './db/seed.ts';

migrate();
if (config.seedDemo && !q.get('SELECT 1 FROM users LIMIT 1')) seedDemo();

const router = new Router();
router.get('/api/health', (_req, res) => res.json({ ok: true, env: config.env, paymentProvider: config.paymentProvider }));
authRoutes(router);
locationRoutes(router);
vehicleRoutes(router);
bookingRoutes(router);
notificationRoutes(router);
communityRoutes(router);
adminRoutes(router);
ownerStatsRoutes(router);
router.get('/api/me/payments', requireAuth, (req, res) => {
  res.json({ items: q.all(`SELECT p.id, p.purpose, p.provider, p.method, p.amount, p.status, p.is_test, p.created_at, b.code AS booking_code, b.id AS booking_id
                           FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.renter_id = ? ORDER BY p.id DESC LIMIT 100`, [req.user!.id]) });
});

const apiLimiter = rateLimiter(600, 60_000);

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(self)',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com https://images.unsplash.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function serveStatic(reqPath: string, raw: http.IncomingMessage, out: http.ServerResponse) {
  let file = path.join(config.publicDir, path.normalize(reqPath).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(config.publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(config.publicDir, 'index.html'); // SPA fallback
    if (!fs.existsSync(file)) { out.statusCode = 503; out.end('Frontend not built. Run: npm run build'); return; }
  }
  const ext = path.extname(file);
  out.setHeader('Content-Type', STATIC_TYPES[ext] ?? 'application/octet-stream');
  // Hashed bundles are immutable; index.html must always revalidate.
  out.setHeader('Cache-Control', /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
  let body = fs.readFileSync(file);
  if (/\.(js|css|html|svg|json)$/.test(ext) && /\bgzip\b/.test(String(raw.headers['accept-encoding'] ?? ''))) {
    body = zlib.gzipSync(body);
    out.setHeader('Content-Encoding', 'gzip');
  }
  out.end(body);
}

const server = http.createServer(async (raw, out) => {
  const started = Date.now();
  const url = new URL(raw.url ?? '/', 'http://localhost');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.setHeader(k, v);
  const res = makeRes(out);

  if (!url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/uploads/')) {
      const key = url.pathname.slice('/uploads/'.length);
      const data = storage.read('public', key);
      if (!data) { out.statusCode = 404; out.end(); return; }
      out.setHeader('Content-Type', mimeFor(key));
      out.setHeader('Cache-Control', 'public, max-age=604800');
      out.end(data);
      return;
    }
    serveStatic(url.pathname, raw, out);
    return;
  }

  const ip = (isProd ? String(raw.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || raw.socket.remoteAddress || 'unknown';
  const req: Req = { raw, method: raw.method ?? 'GET', path: url.pathname, query: url.searchParams, params: {}, body: {}, ip,
    cookies: parseCookies(raw.headers.cookie) };
  try {
    if (!apiLimiter(ip)) throw new ApiError(429, 'RATE_LIMITED');
    // CSRF defence for cookie auth: state-changing requests must be same-origin JSON.
    if (req.method !== 'GET' && raw.headers.origin && new URL(raw.headers.origin).host !== raw.headers.host) throw new ApiError(403, 'BAD_ORIGIN');
    const match = router.match(req.method, req.path);
    if (!match) throw new ApiError(404, 'NOT_FOUND');
    req.params = match.params;
    req.body = await readBody(raw, 8 * 1024 * 1024);
    req.user = loadUser(req);
    out.setHeader('Cache-Control', 'no-store');
    for (const h of match.route.handlers) {
      await h(req, res);
      if (out.writableEnded) break;
    }
  } catch (e: any) {
    if (e instanceof ApiError) {
      res.status(e.status).json({ error: { code: e.code, details: e.details } });
    } else {
      log.error('unhandled', { path: req.path, err: e?.stack ?? String(e) });
      res.status(500).json({ error: { code: 'INTERNAL' } });
    }
  } finally {
    if (!isProd || out.statusCode >= 400) log.info('request', { method: req.method, path: req.path, status: out.statusCode, ms: Date.now() - started });
  }
});

setInterval(() => { try { runScheduledJobs(); } catch (e: any) { log.error('jobs', { err: e?.message }); } }, 60_000).unref();

server.listen(config.port, () => log.info(`VELOX API listening on http://localhost:${config.port}`, { env: config.env }));
