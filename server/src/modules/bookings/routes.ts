import { z } from 'zod';
import { q } from '../../db/index.ts';
import { Router, validate, notFound, forbidden, badRequest, conflict, ApiError } from '../../lib/http.ts';
import { requireAuth } from '../../auth/middleware.ts';
import { storeUpload } from '../../lib/storage.ts';
import { config } from '../../config.ts';
import { getProvider, signMock } from '../payments/provider.ts';
import * as svc from './service.ts';
import { notify } from '../notifications.ts';

const method = z.enum(['qris', 'bank_transfer', 'ewallet', 'card']);
const checklistSchema = z.object({
  items: z.record(z.boolean()),
  conditionOk: z.boolean(),
  notes: z.string().max(1000).optional(),
  photos: z.array(z.string().max(6_000_000)).max(6).default([]),
});

const LIST_SQL = `
  SELECT b.id, b.code, b.status, b.start_at, b.end_at, b.total, b.subtotal, b.deposit, b.late_fee, b.is_demo, b.expires_at, b.created_at,
         v.id AS vehicle_id, v.name AS vehicle_name, v.category, v.type,
         (SELECT url FROM vehicle_images i WHERE i.vehicle_id = v.id ORDER BY position LIMIT 1) AS cover_url,
         rp.full_name AS renter_name, op.full_name AS owner_name, c.name AS city_name, c.utc_offset_minutes,
         EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id AND r.author_id = $me) AS reviewed
  FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN locations c ON c.id = v.city_id
  JOIN user_profiles rp ON rp.user_id = b.renter_id JOIN user_profiles op ON op.user_id = b.owner_id`;

export const bookingRoutes = (r: Router) => {
  r.get('/api/bookings', requireAuth, (req, res) => {
    const as = req.query.get('as') === 'owner' ? 'owner' : 'renter';
    const items = q.all(`${LIST_SQL} WHERE b.${as}_id = $me ORDER BY
      CASE b.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'accepted' THEN 2 WHEN 'confirmed' THEN 3 ELSE 4 END, b.start_at DESC LIMIT 200`,
      { $me: req.user!.id } as any).map((b: any) => ({ ...b, reviewed: !!b.reviewed }));
    res.json({ items });
  });

  r.get('/api/bookings/:id', requireAuth, (req, res) => {
    const b = q.get<any>('SELECT * FROM bookings WHERE id = ?', [Number(req.params.id)]);
    if (!b) throw notFound();
    const isRenter = b.renter_id === req.user!.id, isOwner = b.owner_id === req.user!.id, isAdmin = req.user!.role === 'admin';
    if (!isRenter && !isOwner && !isAdmin) throw forbidden();
    const vehicle = q.get(`SELECT v.id, v.name, v.brand, v.model, v.category, v.type, v.pickup_address, v.lat, v.lng, v.rules, v.deposit,
                           c.name AS city_name, c.utc_offset_minutes, (SELECT url FROM vehicle_images i WHERE i.vehicle_id = v.id ORDER BY position LIMIT 1) AS cover_url
                           FROM vehicles v JOIN locations c ON c.id = v.city_id WHERE v.id = ?`, [b.vehicle_id]);
    const person = (id: number) => q.get(`SELECT u.id, p.full_name, p.avatar_url, u.phone_verified_at IS NOT NULL AS phone_verified,
      EXISTS (SELECT 1 FROM user_verifications uv WHERE uv.user_id = u.id AND uv.type = 'identity' AND uv.status = 'approved') AS identity_verified
      FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`, [id]);
    // The pickup code is shown only to the renter (they hand it to the owner at pickup), and only once paid.
    const showCode = isRenter && ['confirmed', 'active'].includes(b.status);
    res.json({
      booking: { ...b, pickup_code: showCode ? b.pickup_code : undefined, price_breakdown: JSON.parse(b.price_breakdown) },
      role: isRenter ? 'renter' : isOwner ? 'owner' : 'admin',
      vehicle,
      renter: person(b.renter_id),
      owner: person(b.owner_id),
      history: q.all('SELECT from_status, to_status, note, created_at FROM booking_status_history WHERE booking_id = ? ORDER BY id', [b.id]),
      payments: q.all('SELECT id, purpose, provider, provider_ref, method, amount, status, is_test, created_at, confirmed_at FROM payments WHERE booking_id = ? ORDER BY id', [b.id]),
      checklists: q.all('SELECT stage, items, condition_ok, notes, photo_urls, created_at FROM handover_checklists WHERE booking_id = ? ORDER BY id', [b.id])
        .map((c: any) => ({ ...c, items: JSON.parse(c.items), photo_urls: JSON.parse(c.photo_urls) })),
      extensions: q.all('SELECT * FROM booking_extensions WHERE booking_id = ? ORDER BY id', [b.id]),
      agreement: q.get('SELECT version, renter_accepted_at, owner_accepted_at FROM rental_agreements WHERE booking_id = ?', [b.id]),
      conversationId: q.get<any>('SELECT id FROM conversations WHERE vehicle_id = ? AND renter_id = ?', [b.vehicle_id, b.renter_id])?.id ?? null,
      myReview: q.get('SELECT rating, comment, created_at FROM reviews WHERE booking_id = ? AND author_id = ?', [b.id, req.user!.id]) ?? null,
      dispute: q.get('SELECT id, reason, status, resolution, created_at FROM disputes WHERE booking_id = ? ORDER BY id DESC LIMIT 1', [b.id]) ?? null,
    });
  });

  r.post('/api/bookings', requireAuth, (req, res) => {
    const b = validate(z.object({
      vehicleId: z.number().int().positive(),
      start: z.string().datetime(),
      end: z.string().datetime(),
      note: z.string().max(500).optional(),
      acceptAgreement: z.boolean(),
    }), req.body);
    res.status(201).json({ booking: svc.createBooking(req.user!, b) });
  });

  r.post('/api/bookings/:id/respond', requireAuth, (req, res) => {
    const b = validate(z.object({ decision: z.enum(['accept', 'reject']), reason: z.string().max(300).optional() }), req.body);
    res.json({ booking: svc.respondToBooking(req.user!, Number(req.params.id), b.decision, b.reason) });
  });

  r.post('/api/bookings/:id/pay', requireAuth, (req, res) => {
    const b = validate(z.object({ method }), req.body);
    res.json(svc.startPayment(req.user!, Number(req.params.id), b.method));
  });

  r.post('/api/bookings/:id/cancel', requireAuth, (req, res) => {
    const b = validate(z.object({ reason: z.string().max(300).optional() }), req.body);
    res.json({ booking: svc.cancelBooking(req.user!, Number(req.params.id), b.reason) });
  });

  r.post('/api/bookings/:id/start', requireAuth, (req, res) => {
    const b = validate(checklistSchema.extend({ pickupCode: z.string().regex(/^\d{6}$/, 'V_CODE') }), req.body);
    const photoUrls = b.photos.map((p) => '/uploads/' + storeUpload(p, 'public'));
    res.json({ booking: svc.startRental(req.user!, Number(req.params.id), b.pickupCode, { ...b, photoUrls }) });
  });

  r.post('/api/bookings/:id/complete', requireAuth, (req, res) => {
    const b = validate(checklistSchema, req.body);
    const photoUrls = b.photos.map((p) => '/uploads/' + storeUpload(p, 'public'));
    res.json({ booking: svc.completeRental(req.user!, Number(req.params.id), { ...b, photoUrls }) });
  });

  r.post('/api/bookings/:id/extend', requireAuth, (req, res) => {
    const b = validate(z.object({ newEnd: z.string().datetime(), method }), req.body);
    res.json(svc.requestExtension(req.user!, Number(req.params.id), b.newEnd, b.method));
  });

  r.post('/api/bookings/:id/review', requireAuth, (req, res) => {
    const body = validate(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }), req.body);
    const b = svc.getBooking(Number(req.params.id));
    if (!b) throw notFound();
    const isRenter = b.renter_id === req.user!.id;
    if (!isRenter && b.owner_id !== req.user!.id) throw forbidden();
    if (b.status !== 'completed') throw conflict('REVIEW_NOT_ALLOWED');
    if (Date.now() - new Date(b.returned_at).getTime() > 14 * 86400_000) throw conflict('REVIEW_WINDOW_CLOSED');
    if (q.get('SELECT 1 FROM reviews WHERE booking_id = ? AND author_id = ?', [b.id, req.user!.id])) throw conflict('ALREADY_REVIEWED');
    q.run(`INSERT INTO reviews (booking_id, author_id, subject_user_id, vehicle_id, direction, rating, comment) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.id, req.user!.id, isRenter ? b.owner_id : b.renter_id, isRenter ? b.vehicle_id : null,
        isRenter ? 'renter_to_owner' : 'owner_to_renter', body.rating, body.comment ?? null]);
    if (isRenter) {
      q.run(`UPDATE vehicles SET rating_avg = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE vehicle_id = ? AND direction = 'renter_to_owner'),
             rating_count = (SELECT COUNT(*) FROM reviews WHERE vehicle_id = ? AND direction = 'renter_to_owner') WHERE id = ?`, [b.vehicle_id, b.vehicle_id, b.vehicle_id]);
    }
    res.status(201).json({ ok: true });
  });

  r.post('/api/bookings/:id/dispute', requireAuth, (req, res) => {
    const body = validate(z.object({
      reason: z.enum(['damage', 'late_return', 'not_as_described', 'no_show', 'payment', 'other']),
      details: z.string().trim().min(10).max(2000),
      claimedAmount: z.number().int().min(0).default(0),
    }), req.body);
    const b = svc.getBooking(Number(req.params.id));
    if (!b) throw notFound();
    if (b.renter_id !== req.user!.id && b.owner_id !== req.user!.id) throw forbidden();
    if (q.get(`SELECT 1 FROM disputes WHERE booking_id = ? AND status IN ('open','reviewing')`, [b.id])) throw conflict('DISPUTE_OPEN');
    q.run('INSERT INTO disputes (booking_id, opened_by, reason, details, claimed_amount) VALUES (?, ?, ?, ?, ?)',
      [b.id, req.user!.id, body.reason, body.details, body.claimedAmount]);
    notify(b.renter_id === req.user!.id ? b.owner_id : b.renter_id, 'dispute_opened', { code: b.code });
    res.status(201).json({ ok: true });
  });

  // ── Payments ──
  r.get('/api/payments/:ref', requireAuth, (req, res) => {
    const p = q.get<any>(`SELECT p.*, b.code AS booking_code, b.renter_id FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.provider_ref = ?`, [req.params.ref]);
    if (!p || (p.renter_id !== req.user!.id && req.user!.role !== 'admin')) throw notFound();
    delete p.raw_event;
    res.json({ payment: p });
  });

  /** Real gateways POST signed webhooks here. */
  r.post('/api/payments/webhook/:provider', (req, res) => {
    let event;
    try { event = getProvider(req.params.provider).parseWebhook(req.raw.headers, req.body); }
    catch { throw new ApiError(401, 'INVALID_SIGNATURE'); }
    svc.handlePaymentEvent(event.providerRef, event.status, event.raw);
    res.json({ received: true });
  });

  /**
   * DEMO ONLY: simulates the customer paying in the mock gateway. The server builds and signs the webhook itself,
   * so the confirmation path is identical to a real gateway's. Disabled whenever a real provider is configured.
   */
  r.post('/api/payments/mock/:ref/simulate', requireAuth, (req, res) => {
    if (config.paymentProvider !== 'mock') throw notFound();
    const { outcome } = validate(z.object({ outcome: z.enum(['succeeded', 'failed']) }), req.body);
    const p = q.get<any>(`SELECT p.*, b.renter_id FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.provider_ref = ?`, [req.params.ref]);
    if (!p || p.renter_id !== req.user!.id) throw notFound();
    if (p.provider !== 'mock') throw badRequest('NOT_MOCK');
    const body = { ref: p.provider_ref, status: outcome, simulated: true, at: new Date().toISOString() };
    const event = getProvider('mock').parseWebhook({ 'x-mock-signature': signMock(JSON.stringify(body)) }, body);
    svc.handlePaymentEvent(event.providerRef, event.status, event.raw);
    res.json({ payment: q.get('SELECT id, provider_ref, status, amount, booking_id, purpose FROM payments WHERE id = ?', [p.id]) });
  });
};
