import { z } from 'zod';
import { q, tx, SETTING_DEFAULTS, getSetting } from '../db/index.ts';
import { Router, validate, notFound, badRequest } from '../lib/http.ts';
import { requireRole } from '../auth/middleware.ts';
import { storage, mimeFor } from '../lib/storage.ts';
import { notify } from './notifications.ts';
import { nowIso } from '../lib/util.ts';

const admin = requireRole('admin');
const audit = (actorId: number, action: string, targetType: string, targetId: number, meta?: unknown) =>
  q.run('INSERT INTO audit_log (actor_id, action, target_type, target_id, meta) VALUES (?, ?, ?, ?, ?)',
    [actorId, action, targetType, targetId, meta ? JSON.stringify(meta) : null]);

export const adminRoutes = (r: Router) => {
  r.get('/api/admin/overview', admin, (_req, res) => {
    const counts = q.get(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'owner') AS owners,
      (SELECT COUNT(*) FROM vehicles WHERE status = 'active') AS active_vehicles,
      (SELECT COUNT(*) FROM vehicles WHERE status = 'pending_review') AS pending_vehicles,
      (SELECT COUNT(*) FROM bookings) AS bookings,
      (SELECT COUNT(*) FROM bookings WHERE status = 'active') AS active_rentals,
      (SELECT COUNT(*) FROM bookings WHERE status = 'completed') AS completed,
      (SELECT COUNT(*) FROM user_verifications WHERE status = 'pending') AS pending_verifications,
      (SELECT COUNT(*) FROM reports WHERE status IN ('open','reviewing')) AS open_reports,
      (SELECT COUNT(*) FROM disputes WHERE status IN ('open','reviewing')) AS open_disputes,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'renter_charge') AS gmv,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'platform_commission') AS commission,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'refund') AS refunds`);
    const daily = q.all(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS bookings, COALESCE(SUM(subtotal), 0) AS value
                         FROM bookings WHERE created_at >= date('now', '-29 days') GROUP BY day ORDER BY day`);
    const byCity = q.all(`SELECT c.name AS city, COUNT(DISTINCT v.id) AS vehicles, COUNT(b.id) AS bookings
                          FROM locations c LEFT JOIN vehicles v ON v.city_id = c.id AND v.status = 'active'
                          LEFT JOIN bookings b ON b.vehicle_id = v.id WHERE c.type = 'city' GROUP BY c.id ORDER BY bookings DESC, vehicles DESC LIMIT 10`);
    const byCategory = q.all(`SELECT v.category, COUNT(b.id) AS bookings FROM vehicles v LEFT JOIN bookings b ON b.vehicle_id = v.id GROUP BY v.category`);
    res.json({ counts, daily, byCity, byCategory });
  });

  // ── Users ──
  r.get('/api/admin/users', admin, (req, res) => {
    const search = req.query.get('q');
    res.json({ items: q.all(`
      SELECT u.id, u.email, u.phone, u.role, u.status, u.email_verified_at, u.phone_verified_at, u.is_demo, u.created_at, p.full_name,
        (SELECT COUNT(*) FROM bookings WHERE renter_id = u.id) AS rentals,
        (SELECT COUNT(*) FROM vehicles WHERE owner_id = u.id) AS vehicles,
        (SELECT COUNT(*) FROM reports WHERE target_type = 'user' AND target_id = u.id) AS reports,
        (SELECT COUNT(*) FROM bookings WHERE renter_id = u.id AND status = 'cancelled' AND cancelled_by = u.id) AS cancellations
      FROM users u JOIN user_profiles p ON p.user_id = u.id
      ${search ? 'WHERE u.email LIKE ? OR p.full_name LIKE ? OR u.phone LIKE ?' : ''}
      ORDER BY u.id DESC LIMIT 200`, search ? Array(3).fill(`%${search}%`) : []) });
  });

  r.patch('/api/admin/users/:id', admin, (req, res) => {
    const b = validate(z.object({ status: z.enum(['active', 'suspended']).optional(), role: z.enum(['renter', 'owner', 'admin']).optional() }), req.body);
    const id = Number(req.params.id);
    if (id === req.user!.id) throw badRequest('CANNOT_MODIFY_SELF');
    tx(() => {
      if (b.status) {
        q.run('UPDATE users SET status = ? WHERE id = ?', [b.status, id]);
        if (b.status === 'suspended') {
          q.run('DELETE FROM sessions WHERE user_id = ?', [id]);
          q.run(`UPDATE vehicles SET status = 'suspended' WHERE owner_id = ? AND status = 'active'`, [id]);
        }
      }
      if (b.role) q.run('UPDATE users SET role = ? WHERE id = ?', [b.role, id]);
      audit(req.user!.id, 'user.update', 'user', id, b);
    });
    res.json({ ok: true });
  });

  // ── Verification queue ──
  r.get('/api/admin/verifications', admin, (req, res) => {
    const status = req.query.get('status') ?? 'pending';
    res.json({ items: q.all(`
      SELECT v.*, p.full_name, u.email, p.date_of_birth FROM user_verifications v JOIN users u ON u.id = v.user_id JOIN user_profiles p ON p.user_id = v.user_id
      WHERE v.status = ? ORDER BY v.created_at ASC LIMIT 200`, [status]).map((v: any) => ({ ...v, has_document: !!v.document_key, document_key: undefined })) });
  });

  /** Private documents are streamed only to admins — never exposed through a public URL. */
  r.get('/api/admin/verifications/:id/document', admin, (req, res) => {
    const v = q.get<any>('SELECT document_key FROM user_verifications WHERE id = ?', [Number(req.params.id)]);
    const data = v?.document_key && storage.read('private', v.document_key);
    if (!data) throw notFound();
    audit(req.user!.id, 'verification.document_viewed', 'verification', Number(req.params.id));
    res.setHeader('Cache-Control', 'no-store');
    res.send(data, mimeFor(v.document_key));
  });

  r.post('/api/admin/verifications/:id', admin, (req, res) => {
    const b = validate(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(300).optional() }), req.body);
    const v = q.get<any>('SELECT * FROM user_verifications WHERE id = ?', [Number(req.params.id)]);
    if (!v) throw notFound();
    tx(() => {
      q.run('UPDATE user_verifications SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ? WHERE id = ?',
        [b.decision, req.user!.id, b.note ?? null, nowIso(), v.id]);
      if (v.type === 'student' && b.decision === 'approved') q.run('UPDATE user_profiles SET university_verified = 1 WHERE user_id = ?', [v.user_id]);
      audit(req.user!.id, `verification.${b.decision}`, 'verification', v.id);
    });
    notify(v.user_id, b.decision === 'approved' ? 'verification_approved' : 'verification_rejected', { type: v.type }, '/account');
    res.json({ ok: true });
  });

  // ── Vehicles ──
  r.get('/api/admin/vehicles', admin, (req, res) => {
    const status = req.query.get('status');
    res.json({ items: q.all(`
      SELECT v.id, v.name, v.brand, v.model, v.category, v.type, v.status, v.registration_status, v.plate_number, v.is_demo, v.created_at,
        v.registration_doc_key IS NOT NULL AS has_registration_doc, c.name AS city_name, p.full_name AS owner_name,
        (SELECT COUNT(*) FROM reports WHERE target_type = 'vehicle' AND target_id = v.id) AS reports
      FROM vehicles v JOIN locations c ON c.id = v.city_id JOIN user_profiles p ON p.user_id = v.owner_id
      ${status ? 'WHERE v.status = ?' : ''} ORDER BY (v.status = 'pending_review') DESC, v.id DESC LIMIT 300`, status ? [status] : []) });
  });

  r.get('/api/admin/vehicles/:id/registration', admin, (req, res) => {
    const v = q.get<any>('SELECT registration_doc_key FROM vehicles WHERE id = ?', [Number(req.params.id)]);
    const data = v?.registration_doc_key && storage.read('private', v.registration_doc_key);
    if (!data) throw notFound();
    res.setHeader('Cache-Control', 'no-store');
    res.send(data, mimeFor(v.registration_doc_key));
  });

  r.post('/api/admin/vehicles/:id', admin, (req, res) => {
    const b = validate(z.object({ action: z.enum(['approve', 'reject', 'suspend', 'reinstate']), note: z.string().max(300).optional() }), req.body);
    const v = q.get<any>('SELECT * FROM vehicles WHERE id = ?', [Number(req.params.id)]);
    if (!v) throw notFound();
    const updates: Record<string, [string, string | null]> = {
      approve: ['active', 'approved'], reject: ['suspended', 'rejected'], suspend: ['suspended', null], reinstate: ['active', null],
    };
    const [status, reg] = updates[b.action];
    q.run(`UPDATE vehicles SET status = ?, registration_status = COALESCE(?, registration_status), updated_at = ? WHERE id = ?`, [status, reg, nowIso(), v.id]);
    audit(req.user!.id, `vehicle.${b.action}`, 'vehicle', v.id, { note: b.note });
    if (b.action === 'suspend' || b.action === 'reject') notify(v.owner_id, 'listing_suspended', { vehicle: v.name }, '/dashboard/owner');
    res.json({ ok: true });
  });

  // ── Bookings & finance ──
  r.get('/api/admin/bookings', admin, (req, res) => {
    const status = req.query.get('status');
    res.json({ items: q.all(`
      SELECT b.id, b.code, b.status, b.start_at, b.end_at, b.total, b.is_demo, b.created_at, v.name AS vehicle_name, v.category,
        rp.full_name AS renter_name, op.full_name AS owner_name
      FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN user_profiles rp ON rp.user_id = b.renter_id JOIN user_profiles op ON op.user_id = b.owner_id
      ${status ? 'WHERE b.status = ?' : ''} ORDER BY b.id DESC LIMIT 300`, status ? [status] : []) });
  });

  r.get('/api/admin/transactions', admin, (_req, res) => {
    res.json({
      items: q.all(`SELECT t.*, b.code AS booking_code, p.full_name AS user_name FROM transactions t
                    LEFT JOIN bookings b ON b.id = t.booking_id LEFT JOIN user_profiles p ON p.user_id = t.user_id ORDER BY t.id DESC LIMIT 300`),
      monthly: q.all(`SELECT substr(created_at, 1, 7) AS month, type, SUM(amount) AS amount FROM transactions GROUP BY month, type ORDER BY month DESC`),
    });
  });

  // ── Reports & disputes ──
  r.get('/api/admin/reports', admin, (_req, res) => {
    res.json({ items: q.all(`SELECT r.*, p.full_name AS reporter_name FROM reports r JOIN user_profiles p ON p.user_id = r.reporter_id
                             ORDER BY (r.status IN ('open','reviewing')) DESC, r.id DESC LIMIT 200`) });
  });
  r.post('/api/admin/reports/:id', admin, (req, res) => {
    const b = validate(z.object({ status: z.enum(['reviewing', 'resolved', 'dismissed']), resolution: z.string().max(500).optional() }), req.body);
    q.run('UPDATE reports SET status = ?, resolution = ?, handled_by = ? WHERE id = ?', [b.status, b.resolution ?? null, req.user!.id, Number(req.params.id)]);
    audit(req.user!.id, `report.${b.status}`, 'report', Number(req.params.id));
    res.json({ ok: true });
  });

  r.get('/api/admin/disputes', admin, (_req, res) => {
    res.json({ items: q.all(`SELECT d.*, b.code AS booking_code, b.deposit, p.full_name AS opened_by_name FROM disputes d
                             JOIN bookings b ON b.id = d.booking_id JOIN user_profiles p ON p.user_id = d.opened_by
                             ORDER BY (d.status IN ('open','reviewing')) DESC, d.id DESC LIMIT 200`) });
  });
  r.post('/api/admin/disputes/:id', admin, (req, res) => {
    const b = validate(z.object({
      status: z.enum(['reviewing', 'resolved_renter', 'resolved_owner', 'closed']),
      resolution: z.string().max(1000).optional(),
      awardAmount: z.number().int().min(0).default(0),
    }), req.body);
    const d = q.get<any>('SELECT d.*, b.deposit, b.late_fee, b.renter_id, b.owner_id, b.code FROM disputes d JOIN bookings b ON b.id = d.booking_id WHERE d.id = ?', [Number(req.params.id)]);
    if (!d) throw notFound();
    tx(() => {
      q.run('UPDATE disputes SET status = ?, resolution = ?, handled_by = ?, updated_at = ? WHERE id = ?', [b.status, b.resolution ?? null, req.user!.id, nowIso(), d.id]);
      if (d.reason === 'damage' && (b.status === 'resolved_owner' || b.status === 'resolved_renter')) {
        const held = Math.max(0, d.deposit - Math.min(d.late_fee, d.deposit));
        const award = b.status === 'resolved_owner' ? Math.min(b.awardAmount || held, held) : 0;
        if (award > 0) {
          q.run(`INSERT INTO transactions (booking_id, user_id, type, amount, description) VALUES (?, ?, 'deposit_capture', ?, 'damage_award')`, [d.booking_id, d.renter_id, award]);
          q.run(`UPDATE owner_earnings SET gross = gross + ?, net = net + ? WHERE booking_id = ?`, [award, award, d.booking_id]);
        }
        if (held - award > 0) q.run(`INSERT INTO transactions (booking_id, user_id, type, amount, description) VALUES (?, ?, 'deposit_release', ?, 'dispute_resolved')`, [d.booking_id, d.renter_id, held - award]);
      }
      audit(req.user!.id, `dispute.${b.status}`, 'dispute', d.id, { award: b.awardAmount });
    });
    notify(d.renter_id, 'dispute_updated', { code: d.code });
    notify(d.owner_id, 'dispute_updated', { code: d.code });
    res.json({ ok: true });
  });

  // ── Settings & commission ──
  r.get('/api/admin/settings', admin, (_req, res) => {
    const settings = Object.fromEntries(Object.keys(SETTING_DEFAULTS).map((k) => [k, getSetting(k)]));
    const commissions = q.all('SELECT * FROM platform_commissions ORDER BY effective_from DESC LIMIT 20');
    res.json({ settings, commissions });
  });
  r.put('/api/admin/settings', admin, (req, res) => {
    const b = validate(z.record(z.string().regex(/^-?\d+(\.\d+)?$/, 'V_NUMBER')), req.body);
    tx(() => {
      for (const [k, v] of Object.entries(b)) {
        if (!(k in SETTING_DEFAULTS)) continue;
        q.run(`INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [k, v, nowIso()]);
      }
      audit(req.user!.id, 'settings.update', 'settings', 0, b);
    });
    res.json({ ok: true });
  });
  r.post('/api/admin/commissions', admin, (req, res) => {
    const b = validate(z.object({ ratePercent: z.number().min(0).max(50), category: z.enum(['bicycle', 'motorcycle']).nullable().default(null) }), req.body);
    q.run('INSERT INTO platform_commissions (rate, category, effective_from, created_by) VALUES (?, ?, ?, ?)',
      [b.ratePercent / 100, b.category, nowIso(), req.user!.id]);
    audit(req.user!.id, 'commission.update', 'commission', 0, b);
    res.status(201).json({ ok: true });
  });
};

// ── Owner earnings & stats ──
export const ownerStatsRoutes = (r: Router) => {
  r.get('/api/owner/earnings', requireRole('owner'), (req, res) => {
    const me = req.user!.id;
    const summary = q.get(`SELECT
      COALESCE(SUM(CASE WHEN status IN ('available','paid_out') THEN net END), 0) AS total,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN net END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'available' THEN net END), 0) AS available,
      COALESCE(SUM(CASE WHEN status <> 'reversed' THEN commission END), 0) AS commission_paid,
      (SELECT COUNT(*) FROM bookings WHERE owner_id = $me AND status = 'completed') AS completed_rentals,
      (SELECT COUNT(*) FROM bookings WHERE owner_id = $me AND status IN ('confirmed','active')) AS active_bookings,
      (SELECT COUNT(*) FROM bookings WHERE owner_id = $me AND status = 'pending') AS pending_requests
      FROM owner_earnings WHERE owner_id = $me`, { $me: me } as any);
    const monthly = q.all(`SELECT substr(b.start_at, 1, 7) AS month, SUM(e.net) AS net, COUNT(*) AS rentals
                           FROM owner_earnings e JOIN bookings b ON b.id = e.booking_id WHERE e.owner_id = ? AND e.status <> 'reversed'
                           GROUP BY month ORDER BY month DESC LIMIT 12`, [me]);
    const popular = q.all(`SELECT v.id, v.name, COUNT(b.id) AS rentals, COALESCE(SUM(e.net), 0) AS net FROM vehicles v
                           LEFT JOIN bookings b ON b.vehicle_id = v.id AND b.status IN ('completed','active','confirmed')
                           LEFT JOIN owner_earnings e ON e.booking_id = b.id AND e.status <> 'reversed'
                           WHERE v.owner_id = ? GROUP BY v.id ORDER BY rentals DESC LIMIT 5`, [me]);
    const ledger = q.all(`SELECT t.id, t.type, t.amount, t.description, t.created_at, b.code AS booking_code FROM transactions t
                          JOIN bookings b ON b.id = t.booking_id WHERE b.owner_id = ? AND t.type IN ('owner_earning','refund','late_fee','deposit_capture','payout')
                          ORDER BY t.id DESC LIMIT 100`, [me]);
    res.json({ summary, monthly, popular, ledger });
  });
};
