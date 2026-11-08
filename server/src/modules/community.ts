import { z } from 'zod';
import { q, tx } from '../db/index.ts';
import { Router, validate, notFound, forbidden, badRequest, ApiError } from '../lib/http.ts';
import { requireAuth } from '../auth/middleware.ts';
import { rateLimiter, nowIso } from '../lib/util.ts';
import { notify } from './notifications.ts';
import { ensureConversation } from './bookings/service.ts';

const msgLimiter = rateLimiter(30, 60_000);

/** Masks phone numbers / emails in early messages to keep payment & contact on-platform (anti-fraud). */
export function maskContact(text: string) {
  return text
    .replace(/(\+?62|0)8[\d\s-]{7,13}/g, '[•••]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[•••]');
}

export const communityRoutes = (r: Router) => {
  // ── Private messaging (renter ↔ owner, per vehicle) ──
  r.get('/api/conversations', requireAuth, (req, res) => {
    const me = req.user!.id;
    res.json({ items: q.all(`
      SELECT c.id, c.vehicle_id, c.booking_id, c.last_message_at, v.name AS vehicle_name,
        (SELECT url FROM vehicle_images i WHERE i.vehicle_id = v.id ORDER BY position LIMIT 1) AS cover_url,
        CASE WHEN c.renter_id = $me THEN op.full_name ELSE rp.full_name END AS other_name,
        CASE WHEN c.renter_id = $me THEN 'renter' ELSE 'owner' END AS my_role,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $me AND m.read_at IS NULL) AS unread
      FROM conversations c JOIN vehicles v ON v.id = c.vehicle_id
      JOIN user_profiles rp ON rp.user_id = c.renter_id JOIN user_profiles op ON op.user_id = c.owner_id
      WHERE c.renter_id = $me OR c.owner_id = $me ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`, { $me: me } as any) });
  });

  r.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
    const c = q.get<any>('SELECT * FROM conversations WHERE id = ?', [Number(req.params.id)]);
    if (!c) throw notFound();
    if (c.renter_id !== req.user!.id && c.owner_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
    q.run('UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL', [nowIso(), c.id, req.user!.id]);
    const header = q.get(`SELECT v.name AS vehicle_name, v.id AS vehicle_id, rp.full_name AS renter_name, op.full_name AS owner_name
                          FROM vehicles v, user_profiles rp, user_profiles op WHERE v.id = ? AND rp.user_id = ? AND op.user_id = ?`,
      [c.vehicle_id, c.renter_id, c.owner_id]);
    res.json({ conversation: { ...c, ...header }, items: q.all('SELECT id, sender_id, body, read_at, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 200', [c.id]).reverse() });
  });

  r.post('/api/conversations/:id/messages', requireAuth, (req, res) => {
    if (!msgLimiter('msg:' + req.user!.id)) throw new ApiError(429, 'RATE_LIMITED');
    const { body } = validate(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
    const c = q.get<any>('SELECT * FROM conversations WHERE id = ?', [Number(req.params.id)]);
    if (!c) throw notFound();
    if (c.renter_id !== req.user!.id && c.owner_id !== req.user!.id) throw forbidden();
    const confirmed = q.get(`SELECT 1 FROM bookings WHERE vehicle_id = ? AND renter_id = ? AND status IN ('confirmed','active','completed')`, [c.vehicle_id, c.renter_id]);
    const text = confirmed ? body : maskContact(body);
    const { id } = tx(() => {
      const m = q.run('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)', [c.id, req.user!.id, text]);
      q.run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [nowIso(), c.id]);
      return m;
    });
    const recipient = c.renter_id === req.user!.id ? c.owner_id : c.renter_id;
    const recentUnread = q.get(`SELECT 1 FROM notifications WHERE user_id = ? AND type = 'new_message' AND read_at IS NULL AND json_extract(payload, '$.conversationId') = ?`, [recipient, c.id]);
    if (!recentUnread) notify(recipient, 'new_message', { conversationId: c.id }, `/messages/${c.id}`);
    res.status(201).json({ message: q.get('SELECT id, sender_id, body, read_at, created_at FROM messages WHERE id = ?', [id]) });
  });

  /** Ask the owner a question before booking. */
  r.post('/api/vehicles/:id/contact', requireAuth, (req, res) => {
    const v = q.get<any>(`SELECT id, owner_id FROM vehicles WHERE id = ? AND status = 'active'`, [Number(req.params.id)]);
    if (!v) throw notFound();
    if (v.owner_id === req.user!.id) throw badRequest('OWN_VEHICLE');
    res.json({ conversationId: ensureConversation(v.id, req.user!.id, v.owner_id) });
  });

  // ── Reports ──
  r.post('/api/reports', requireAuth, (req, res) => {
    const b = validate(z.object({
      targetType: z.enum(['user', 'vehicle', 'booking', 'message']),
      targetId: z.number().int().positive(),
      reason: z.enum(['fraud', 'unsafe', 'inaccurate', 'harassment', 'damage', 'other']),
      details: z.string().trim().max(2000).optional(),
    }), req.body);
    q.run('INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?)',
      [req.user!.id, b.targetType, b.targetId, b.reason, b.details ?? null]);
    res.status(201).json({ ok: true });
  });

  // ── Public profile ──
  r.get('/api/users/:id', (req, res) => {
    const u = q.get<any>(`SELECT u.id, u.created_at, u.role, p.full_name, p.avatar_url, p.bio, un.short_name AS university_name, p.university_verified,
      EXISTS (SELECT 1 FROM user_verifications uv WHERE uv.user_id = u.id AND uv.type = 'identity' AND uv.status = 'approved') AS identity_verified,
      (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE subject_user_id = u.id) AS rating,
      (SELECT COUNT(*) FROM reviews WHERE subject_user_id = u.id) AS review_count
      FROM users u JOIN user_profiles p ON p.user_id = u.id LEFT JOIN universities un ON un.id = p.university_id WHERE u.id = ? AND u.status = 'active'`, [Number(req.params.id)]);
    if (!u) throw notFound();
    res.json({ user: u });
  });
};
