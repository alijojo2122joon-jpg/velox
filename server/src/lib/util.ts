import crypto from 'node:crypto';

export const nowIso = () => new Date().toISOString();
export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/** Structured JSON logger (stdout). Swap for pino/Datadog in production without touching call sites. */
export const log = {
  info: (msg: string, meta: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ level: 'info', time: nowIso(), msg, ...meta })),
  warn: (msg: string, meta: Record<string, unknown> = {}) =>
    console.warn(JSON.stringify({ level: 'warn', time: nowIso(), msg, ...meta })),
  error: (msg: string, meta: Record<string, unknown> = {}) =>
    console.error(JSON.stringify({ level: 'error', time: nowIso(), msg, ...meta })),
};

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomDigits = (n: number) =>
  Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const bookingCode = () =>
  'VX-' + Array.from({ length: 6 }, () => ALPH[crypto.randomInt(0, ALPH.length)]).join('');

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Fixed-window in-memory rate limiter. Replace with Redis for multi-instance deployments. */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => {
    const t = Date.now();
    for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
  }, windowMs).unref();
  return (key: string) => {
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return true; }
    h.n++;
    return h.n <= limit;
  };
}
