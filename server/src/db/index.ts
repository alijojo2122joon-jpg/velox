import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { log } from '../lib/util.ts';

/**
 * Database access layer.
 * Development uses SQLite (built into Node 22, zero setup). Production targets PostgreSQL + PostGIS —
 * see database/postgres/001_schema.sql. All SQL lives in module services, so the swap is contained
 * to this file plus the few spatial queries in modules/vehicles/search.ts.
 */

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

type Params = Record<string, any> | any[];
const bind = (p?: Params): any[] => (p === undefined ? [] : Array.isArray(p) ? p : [p]);

export const q = {
  all<T = any>(sql: string, p?: Params): T[] {
    return db.prepare(sql).all(...bind(p)) as T[];
  },
  get<T = any>(sql: string, p?: Params): T | undefined {
    return db.prepare(sql).get(...bind(p)) as T | undefined;
  },
  run(sql: string, p?: Params) {
    const r = db.prepare(sql).run(...bind(p));
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  },
};

let depth = 0;
/**
 * Run fn inside a write transaction. BEGIN IMMEDIATE takes the write lock up front, which is what makes
 * the booking overlap check + insert atomic (Postgres additionally enforces it with an EXCLUDE constraint).
 */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = path.join(config.rootDir, 'server', 'src', 'db', 'migrations');
  const done = new Set(q.all<{ name: string }>('SELECT name FROM schema_migrations').map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    tx(() => {
      db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
      q.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [file, new Date().toISOString()]);
    });
    log.info('migration applied', { file });
  }
}

/** Platform settings with typed defaults. Admins edit these in the dashboard. */
export const SETTING_DEFAULTS: Record<string, string> = {
  motorcycle_min_age: '18',
  cancellation_free_hours: '24',
  late_cancellation_refund_pct: '50',
  late_grace_minutes: '15',
  late_fee_multiplier: '1.5',
  request_expiry_minutes: '120',
  payment_expiry_minutes: '30',
};

export function getSetting(key: string): string {
  return q.get<{ value: string }>('SELECT value FROM platform_settings WHERE key = ?', [key])?.value
    ?? SETTING_DEFAULTS[key];
}
export const getNumberSetting = (key: string) => Number(getSetting(key));

export function currentCommissionRate(category: 'bicycle' | 'motorcycle'): number {
  const now = new Date().toISOString();
  const row = q.get<{ rate: number }>(
    `SELECT rate FROM platform_commissions WHERE effective_from <= ? AND (category = ? OR category IS NULL)
     ORDER BY (category IS NULL), effective_from DESC LIMIT 1`, [now, category]);
  return row?.rate ?? 0.1;
}
