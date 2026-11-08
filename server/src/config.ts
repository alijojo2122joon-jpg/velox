import path from 'node:path';
import fs from 'node:fs';

/** Central configuration. Every value can be overridden with an environment variable (see .env.example). */
// Project root = nearest folder containing package.json (works for tsx in dev and the bundled dist/server.js).
let root = import.meta.dirname;
while (!fs.existsSync(path.join(root, 'package.json')) && path.dirname(root) !== root) root = path.dirname(root);

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  rootDir: root,
  dbFile: process.env.DATABASE_FILE ?? path.join(root, 'data', 'velox.db'),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(root, 'data', 'uploads'),
  publicDir: path.join(root, 'web', 'dist'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  /** Payment provider: 'mock' until a real gateway (Midtrans / Xendit) is contracted. */
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'mock',
  /** When true, verification codes are returned in API responses (demo only — never in production). */
  exposeDevCodes: (process.env.EXPOSE_DEV_CODES ?? 'true') === 'true',
  seedDemo: (process.env.SEED_DEMO ?? 'true') === 'true',
  maxUploadBytes: 4 * 1024 * 1024,
  /** Platform operates in Indonesian local time zones; booking windows are evaluated in WIB by default. */
  defaultTzOffsetMinutes: Number(process.env.DEFAULT_TZ_OFFSET_MINUTES ?? 420),
};

export const isProd = config.env === 'production';
