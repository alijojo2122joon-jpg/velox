import { z } from 'zod';
import { q, tx, getNumberSetting } from '../db/index.ts';
import { Router, validate, badRequest, unauthorized, conflict, forbidden, ApiError, type Req } from '../lib/http.ts';
import { sha256, randomToken, randomDigits, addMinutes, rateLimiter } from '../lib/util.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { requireAuth, SESSION_COOKIE } from './middleware.ts';
import { config } from '../config.ts';
import { storeUpload } from '../lib/storage.ts';

const loginLimiter = rateLimiter(10, 15 * 60_000);
const codeLimiter = rateLimiter(5, 15 * 60_000);

const phoneRe = /^\+?62[0-9]{8,13}$|^0[0-9]{9,13}$/; // Indonesian mobile numbers: +62… or 08…
const normalizePhone = (p: string) => (p.startsWith('0') ? '+62' + p.slice(1) : p.startsWith('62') ? '+' + p : p);

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(phoneRe, 'V_PHONE'),
  password: z.string().min(8, 'V_PASSWORD').max(128),
  role: z.enum(['renter', 'owner']),
  locale: z.enum(['en', 'id', 'jv', 'fa']).default('en'),
  cityId: z.number().int().positive().optional(),
  universityId: z.number().int().positive().optional(),
});

function startSession(userId: number, res: any) {
  const token = randomToken();
  const expires = addMinutes(new Date(), config.sessionDays * 24 * 60);
  q.run('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, sha256(token), expires.toISOString()]);
  const cookie = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${config.sessionDays * 86400}`, config.cookieSecure ? 'Secure' : ''].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
  return token;
}

/** Full "me" payload used by the client: account, profile, verification + eligibility state. */
export function getMe(userId: number) {
  const u = q.get<any>(
    `SELECT u.id, u.email, u.phone, u.role, u.status, u.email_verified_at, u.phone_verified_at, u.is_demo, u.created_at,
            p.full_name, p.avatar_url, p.date_of_birth, p.city_id, p.university_id, p.university_verified, p.bio, p.locale,
            c.name AS city_name, un.short_name AS university_name
     FROM users u JOIN user_profiles p ON p.user_id = u.id
     LEFT JOIN locations c ON c.id = p.city_id LEFT JOIN universities un ON un.id = p.university_id
     WHERE u.id = ?`, [userId]);
  if (!u) return null;
  const verifications = q.all(
    `SELECT id, type, status, license_class, expires_on, review_note, created_at, reviewed_at
     FROM user_verifications WHERE user_id = ? ORDER BY id DESC`, [userId]);
  return { ...u, verifications, eligibility: motorcycleEligibility(userId) };
}

/**
 * Motorcycle eligibility (enforced server-side on every motorcycle booking):
 *  - verified email + phone
 *  - approved identity document (KTP / passport)
 *  - approved, unexpired SIM C (motorcycle driving licence) — or, for visitors, an International Driving Permit
 *    with motorcycle category (stored as licence class 'IDP')
 *  - age ≥ platform minimum (default 18, admin-configurable; Indonesian law sets SIM C at 17)
 */
export function motorcycleEligibility(userId: number) {
  const u = q.get<any>(`SELECT u.email_verified_at, u.phone_verified_at, p.date_of_birth FROM users u
                        JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`, [userId]);
  const today = new Date().toISOString().slice(0, 10);
  const idOk = !!q.get(`SELECT 1 FROM user_verifications WHERE user_id = ? AND type = 'identity' AND status = 'approved'`, [userId]);
  const simOk = !!q.get(`SELECT 1 FROM user_verifications WHERE user_id = ? AND type = 'driving_license'
                         AND status = 'approved' AND license_class IN ('C', 'IDP') AND (expires_on IS NULL OR expires_on >= ?)`, [userId, today]);
  const minAge = getNumberSetting('motorcycle_min_age');
  let age: number | null = null;
  if (u?.date_of_birth) {
    const dob = new Date(u.date_of_birth);
    const now = new Date();
    age = now.getUTCFullYear() - dob.getUTCFullYear() -
      (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate()) ? 1 : 0);
  }
  const missing: string[] = [];
  if (!u?.email_verified_at) missing.push('email');
  if (!u?.phone_verified_at) missing.push('phone');
  if (age === null) missing.push('date_of_birth');
  else if (age < minAge) missing.push('age');
  if (!idOk) missing.push('identity');
  if (!simOk) missing.push('license');
  return { motorcycle: missing.length === 0, missing, minAge };
}

export const authRoutes = (r: Router) => {
  r.post('/api/auth/register', (req, res) => {
    if (!loginLimiter('reg:' + req.ip)) throw new ApiError(429, 'RATE_LIMITED');
    const b = validate(registerSchema, req.body);
    const phone = normalizePhone(b.phone);
    if (q.get('SELECT 1 FROM users WHERE email = ?', [b.email])) throw conflict('EMAIL_TAKEN', { email: 'V_EMAIL_TAKEN' });
    if (q.get('SELECT 1 FROM users WHERE phone = ?', [phone])) throw conflict('PHONE_TAKEN', { phone: 'V_PHONE_TAKEN' });
    const id = tx(() => {
      const { id } = q.run('INSERT INTO users (email, phone, password_hash, role) VALUES (?, ?, ?, ?)',
        [b.email, phone, hashPassword(b.password), b.role]);
      q.run('INSERT INTO user_profiles (user_id, full_name, locale, city_id, university_id) VALUES (?, ?, ?, ?, ?)',
        [id, b.fullName, b.locale, b.cityId ?? null, b.universityId ?? null]);
      return id;
    });
    startSession(id, res);
    res.status(201).json({ user: getMe(id) });
  });

  r.post('/api/auth/login', (req, res) => {
    if (!loginLimiter('login:' + req.ip)) throw new ApiError(429, 'RATE_LIMITED');
    const b = validate(z.object({ email: z.string().trim().toLowerCase(), password: z.string() }), req.body);
    const u = q.get<any>('SELECT id, password_hash, status FROM users WHERE email = ?', [b.email]);
    if (!u || !verifyPassword(b.password, u.password_hash)) throw new ApiError(401, 'INVALID_CREDENTIALS');
    if (u.status === 'suspended') throw forbidden('ACCOUNT_SUSPENDED');
    startSession(u.id, res);
    res.json({ user: getMe(u.id) });
  });

  r.post('/api/auth/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) q.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  r.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user ? getMe(req.user.id) : null });
  });

  // ── Email / phone verification with one-time codes ──
  // Delivery providers (email: SES/SendGrid, SMS/WhatsApp: Twilio/Vonage/local SMS gateway) are not yet connected,
  // so in demo mode the code is returned in the response and shown in a clearly labelled demo box.
  r.post('/api/auth/verify/:channel/send', requireAuth, (req, res) => {
    const channel = req.params.channel;
    if (channel !== 'email' && channel !== 'phone') throw badRequest('INVALID_CHANNEL');
    if (!codeLimiter(`code:${req.user!.id}`)) throw new ApiError(429, 'RATE_LIMITED');
    const code = randomDigits(6);
    q.run(`INSERT INTO verification_codes (user_id, channel, code_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [req.user!.id, channel, sha256(code), addMinutes(new Date(), 10).toISOString()]);
    res.json({ sent: true, demoCode: config.exposeDevCodes ? code : undefined });
  });

  r.post('/api/auth/verify/:channel/confirm', requireAuth, (req, res) => {
    const channel = req.params.channel;
    const { code } = validate(z.object({ code: z.string().regex(/^\d{6}$/, 'V_CODE') }), req.body);
    const row = q.get<any>(`SELECT * FROM verification_codes WHERE user_id = ? AND channel = ? AND used_at IS NULL
                            ORDER BY id DESC LIMIT 1`, [req.user!.id, channel]);
    if (!row || row.expires_at < new Date().toISOString() || row.attempts >= 5) throw badRequest('CODE_EXPIRED');
    if (row.code_hash !== sha256(code)) {
      q.run('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      throw badRequest('CODE_INVALID', { code: 'V_CODE' });
    }
    const now = new Date().toISOString();
    tx(() => {
      q.run('UPDATE verification_codes SET used_at = ? WHERE id = ?', [now, row.id]);
      q.run(`UPDATE users SET ${channel === 'email' ? 'email_verified_at' : 'phone_verified_at'} = ? WHERE id = ?`, [now, req.user!.id]);
    });
    res.json({ user: getMe(req.user!.id) });
  });

  // ── Profile ──
  r.patch('/api/me/profile', requireAuth, (req, res) => {
    const b = validate(z.object({
      fullName: z.string().trim().min(2).max(80).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'V_DATE').optional(),
      cityId: z.number().int().positive().nullable().optional(),
      universityId: z.number().int().positive().nullable().optional(),
      bio: z.string().max(500).optional(),
      locale: z.enum(['en', 'id', 'jv', 'fa']).optional(),
      avatar: z.string().max(6_000_000).optional(),
    }), req.body);
    const sets: string[] = [];
    const vals: any[] = [];
    const map: Record<string, string> = { fullName: 'full_name', dateOfBirth: 'date_of_birth', cityId: 'city_id',
      universityId: 'university_id', bio: 'bio', locale: 'locale' };
    for (const [k, col] of Object.entries(map)) {
      if ((b as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((b as any)[k]); }
    }
    if (b.universityId !== undefined) sets.push('university_verified = 0');
    if (b.avatar) { sets.push('avatar_url = ?'); vals.push('/uploads/' + storeUpload(b.avatar, 'public')); }
    if (sets.length) q.run(`UPDATE user_profiles SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ?`,
      [...vals, new Date().toISOString(), req.user!.id]);
    res.json({ user: getMe(req.user!.id) });
  });

  r.post('/api/me/become-owner', requireAuth, (req, res) => {
    if (req.user!.role === 'renter') q.run(`UPDATE users SET role = 'owner' WHERE id = ?`, [req.user!.id]);
    res.json({ user: getMe(req.user!.id) });
  });

  // ── Document verification (identity, motorcycle licence, student card) ──
  r.post('/api/me/verifications', requireAuth, (req, res) => {
    const b = validate(z.object({
      type: z.enum(['identity', 'driving_license', 'student']),
      documentNumber: z.string().trim().min(4).max(40),
      licenseClass: z.enum(['A', 'C', 'C1', 'C2', 'IDP']).optional(),
      expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'V_DATE').optional(),
      document: z.string().min(10).max(6_000_000),
    }), req.body);
    if (b.type === 'driving_license' && !b.licenseClass) throw badRequest('VALIDATION_FAILED', { licenseClass: 'V_REQUIRED' });
    // A student card is checked against the university chosen in the profile, so one must be selected first.
    if (b.type === 'student' && !q.get('SELECT 1 FROM user_profiles WHERE user_id = ? AND university_id IS NOT NULL', [req.user!.id]))
      throw badRequest('UNIVERSITY_REQUIRED');
    if (q.get(`SELECT 1 FROM user_verifications WHERE user_id = ? AND type = ? AND status = 'pending'`, [req.user!.id, b.type]))
      throw conflict('VERIFICATION_PENDING');
    const key = storeUpload(b.document, 'private', true);
    // Only the last 4 characters of the document number are retained (data minimisation, UU PDP).
    q.run(`INSERT INTO user_verifications (user_id, type, document_number, license_class, expires_on, document_key)
           VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user!.id, b.type, '••••' + b.documentNumber.slice(-4), b.licenseClass ?? null, b.expiresOn ?? null, key]);
    res.status(201).json({ user: getMe(req.user!.id) });
  });
};

export function requireUser(req: Req) {
  if (!req.user) throw unauthorized();
  return req.user;
}
