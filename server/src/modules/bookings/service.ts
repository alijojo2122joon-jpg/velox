import { q, tx, getNumberSetting, currentCommissionRate } from '../../db/index.ts';
import { badRequest, conflict, forbidden, notFound, type AuthUser } from '../../lib/http.ts';
import { bookingCode, randomDigits, sha256, addMinutes, nowIso } from '../../lib/util.ts';
import { notify } from '../notifications.ts';
import { motorcycleEligibility } from '../../auth/routes.ts';
import { loadVehicle } from '../vehicles.ts';
import { quote, type Tier } from './pricing.ts';
import { checkAvailability } from './availability.ts';
import { getProvider, type PaymentMethod } from '../payments/provider.ts';
import { config } from '../../config.ts';

/**
 * Booking state machine.
 *
 *  pending ──accept──▶ accepted ──payment ok──▶ confirmed ──pickup──▶ active ──return──▶ completed
 *     │                   │                        │
 *     ├─reject─▶ rejected ├─cancel─▶ cancelled     └─cancel (refund policy)─▶ cancelled
 *     ├─cancel─▶ cancelled└─timeout─▶ expired
 *     └─timeout─▶ expired
 *
 * Instant-book listings skip "pending" and start at "accepted" (awaiting payment).
 */
export type BookingStatus = 'pending' | 'accepted' | 'confirmed' | 'active' | 'completed' | 'rejected' | 'cancelled' | 'expired';

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled', 'expired'],
  accepted: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['active', 'cancelled'],
  active: ['completed'],
  completed: [], rejected: [], cancelled: [], expired: [],
};

export const AGREEMENT_VERSION = '2026-11-v1';

function transition(booking: any, to: BookingStatus, actorId: number | null, note?: string, extra: Record<string, any> = {}) {
  if (!TRANSITIONS[booking.status as BookingStatus].includes(to)) throw conflict('INVALID_TRANSITION', { from: booking.status, to });
  const sets = ['status = ?', 'updated_at = ?'];
  const vals: any[] = [to, nowIso()];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?`); vals.push(v); }
  // Optimistic guard: the update only applies if nobody changed the status meanwhile.
  const r = q.run(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? AND status = ?`, [...vals, booking.id, booking.status]);
  if (!r.changes) throw conflict('BOOKING_CHANGED');
  q.run('INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_id, note) VALUES (?, ?, ?, ?, ?)',
    [booking.id, booking.status, to, actorId, note ?? null]);
  booking.status = to;
}

export const getBooking = (id: number) => q.get<any>('SELECT * FROM bookings WHERE id = ?', [id]);

function participant(booking: any, user: AuthUser) {
  if (!booking) throw notFound();
  const isRenter = booking.renter_id === user.id;
  const isOwner = booking.owner_id === user.id;
  if (!isRenter && !isOwner && user.role !== 'admin') throw forbidden();
  return { isRenter, isOwner, isAdmin: user.role === 'admin' };
}

function ensureConversation(vehicleId: number, renterId: number, ownerId: number, bookingId?: number) {
  const existing = q.get<{ id: number }>('SELECT id FROM conversations WHERE vehicle_id = ? AND renter_id = ?', [vehicleId, renterId]);
  if (existing) {
    if (bookingId) q.run('UPDATE conversations SET booking_id = ? WHERE id = ?', [bookingId, existing.id]);
    return existing.id;
  }
  return q.run('INSERT INTO conversations (vehicle_id, renter_id, owner_id, booking_id) VALUES (?, ?, ?, ?)',
    [vehicleId, renterId, ownerId, bookingId ?? null]).id;
}
export { ensureConversation };

// ───────────────────────── Create ─────────────────────────
export function createBooking(user: AuthUser, input: { vehicleId: number; start: string; end: string; note?: string; acceptAgreement: boolean }) {
  if (!input.acceptAgreement) throw badRequest('AGREEMENT_REQUIRED');
  const start = new Date(input.start).toISOString();
  const end = new Date(input.end).toISOString();

  return tx(() => {
    const v = loadVehicle(input.vehicleId);
    if (!v) throw notFound();
    if (v.owner_id === user.id) throw badRequest('OWN_VEHICLE');
    if (v.category === 'motorcycle') {
      const el = motorcycleEligibility(user.id);
      if (!el.motorcycle) throw forbidden('MOTORCYCLE_NOT_ELIGIBLE');
    }
    // Checked inside the write transaction → no double booking even under concurrent requests.
    const problem = checkAvailability(v, start, end);
    if (problem) throw conflict(problem);

    const tiers = q.all<Tier>('SELECT duration_minutes, price FROM vehicle_pricing WHERE vehicle_id = ? ORDER BY duration_minutes', [v.id]);
    const qt = quote(tiers, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
    if (!qt) throw badRequest('NO_PRICING');

    const instant = !!v.instant_book;
    const status: BookingStatus = instant ? 'accepted' : 'pending';
    const expiryMin = instant ? getNumberSetting('payment_expiry_minutes') : getNumberSetting('request_expiry_minutes');
    // A request can never stay open past its own start time.
    const expiresAt = new Date(Math.min(addMinutes(new Date(), expiryMin).getTime(), new Date(start).getTime() + 15 * 60_000)).toISOString();

    const code = bookingCode();
    const { id } = q.run(`
      INSERT INTO bookings (code, vehicle_id, renter_id, owner_id, start_at, end_at, status, subtotal, deposit, total, commission_rate,
        price_breakdown, renter_note, pickup_code, expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, v.id, user.id, v.owner_id, start, end, status, qt.subtotal, v.deposit, qt.subtotal + v.deposit,
        currentCommissionRate(v.category), JSON.stringify(qt), input.note ?? null, randomDigits(6), expiresAt]);
    q.run('INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_id) VALUES (?, NULL, ?, ?)', [id, status, user.id]);
    q.run('INSERT INTO rental_agreements (booking_id, version, content_hash, renter_accepted_at, owner_accepted_at) VALUES (?, ?, ?, ?, ?)',
      [id, AGREEMENT_VERSION, sha256(AGREEMENT_VERSION), nowIso(), instant ? nowIso() : null]);
    ensureConversation(v.id, user.id, v.owner_id, id);
    notify(v.owner_id, 'booking_requested', { code, vehicle: v.name }, `/dashboard/owner/bookings/${id}`);
    if (instant) notify(user.id, 'booking_accepted', { code, vehicle: v.name }, `/bookings/${id}`);
    return getBooking(id);
  });
}

// ───────────────────────── Owner decisions ─────────────────────────
export function respondToBooking(user: AuthUser, id: number, decision: 'accept' | 'reject', reason?: string) {
  return tx(() => {
    const b = getBooking(id);
    const p = participant(b, user);
    if (!p.isOwner && !p.isAdmin) throw forbidden();
    expireIfDue(b);
    if (b.status !== 'pending') throw conflict('INVALID_TRANSITION', { from: b.status });
    const vehicle = q.get<any>('SELECT name FROM vehicles WHERE id = ?', [b.vehicle_id]);
    if (decision === 'accept') {
      const expires = addMinutes(new Date(), getNumberSetting('payment_expiry_minutes')).toISOString();
      transition(b, 'accepted', user.id, undefined, { expires_at: expires });
      q.run('UPDATE rental_agreements SET owner_accepted_at = ? WHERE booking_id = ?', [nowIso(), id]);
      notify(b.renter_id, 'booking_accepted', { code: b.code, vehicle: vehicle.name }, `/bookings/${id}`);
    } else {
      transition(b, 'rejected', user.id, reason, { cancel_reason: reason ?? null });
      notify(b.renter_id, 'booking_rejected', { code: b.code, vehicle: vehicle.name }, `/bookings/${id}`);
    }
    return getBooking(id);
  });
}

// ───────────────────────── Payment ─────────────────────────
export function startPayment(user: AuthUser, id: number, method: PaymentMethod) {
  return tx(() => {
    const b = getBooking(id);
    const p = participant(b, user);
    if (!p.isRenter) throw forbidden();
    expireIfDue(b);
    if (b.status !== 'accepted') throw conflict('NOT_AWAITING_PAYMENT', { status: b.status });
    const pending = q.get<any>(`SELECT * FROM payments WHERE booking_id = ? AND purpose = 'booking' AND status = 'pending'`, [id]);
    if (pending && pending.method === method) return { payment: pending, checkoutUrl: `/pay/${pending.provider_ref}` };
    if (pending) q.run(`UPDATE payments SET status = 'expired' WHERE id = ?`, [pending.id]);
    const provider = getProvider(config.paymentProvider);
    const charge = provider.createCharge({ amount: b.total, method, description: `VELOX ${b.code}`, bookingCode: b.code });
    const { id: pid } = q.run(`INSERT INTO payments (booking_id, purpose, provider, provider_ref, method, amount, status, is_test)
                               VALUES (?, 'booking', ?, ?, ?, ?, 'pending', ?)`,
      [id, provider.name, charge.providerRef, method, b.total, charge.isTest ? 1 : 0]);
    return { payment: q.get('SELECT * FROM payments WHERE id = ?', [pid]), checkoutUrl: charge.checkoutUrl };
  });
}

/** Called only from a verified provider webhook. Idempotent. */
export function handlePaymentEvent(providerRef: string, status: 'succeeded' | 'failed' | 'expired', raw: unknown) {
  return tx(() => {
    const pay = q.get<any>('SELECT * FROM payments WHERE provider_ref = ?', [providerRef]);
    if (!pay) throw notFound();
    if (pay.status !== 'pending') return pay; // already processed (webhooks may be retried)
    q.run('UPDATE payments SET status = ?, raw_event = ?, confirmed_at = ? WHERE id = ?',
      [status, JSON.stringify(raw), status === 'succeeded' ? nowIso() : null, pay.id]);
    const b = getBooking(pay.booking_id);
    const vehicle = q.get<any>('SELECT name FROM vehicles WHERE id = ?', [b.vehicle_id]);

    if (status !== 'succeeded') {
      if (pay.purpose === 'extension') q.run(`UPDATE booking_extensions SET status = 'failed' WHERE id = ?`, [pay.extension_id]);
      notify(b.renter_id, 'payment_failed', { code: b.code }, `/bookings/${b.id}`);
      return pay;
    }

    if (pay.purpose === 'booking') {
      if (b.status !== 'accepted') {
        // Booking expired/cancelled while the customer was paying → refund automatically.
        getProvider(pay.provider).refund(pay.provider_ref, pay.amount);
        q.run(`UPDATE payments SET status = 'refunded' WHERE id = ?`, [pay.id]);
        q.run(`INSERT INTO transactions (booking_id, payment_id, user_id, type, amount, description) VALUES (?, ?, ?, 'refund', ?, 'auto_refund_late_payment')`,
          [b.id, pay.id, b.renter_id, pay.amount]);
        return pay;
      }
      transition(b, 'confirmed', null, 'payment_confirmed', { expires_at: null });
      const commission = Math.round(b.subtotal * b.commission_rate);
      const ledger = (userId: number | null, type: string, amount: number, desc?: string) =>
        q.run('INSERT INTO transactions (booking_id, payment_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?, ?)',
          [b.id, pay.id, userId, type, amount, desc ?? null]);
      ledger(b.renter_id, 'renter_charge', b.subtotal);
      if (b.deposit > 0) ledger(b.renter_id, 'deposit_hold', b.deposit);
      ledger(null, 'platform_commission', commission);
      ledger(b.owner_id, 'owner_earning', b.subtotal - commission, 'pending_until_completion');
      q.run(`INSERT INTO owner_earnings (owner_id, booking_id, gross, commission, net, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
        [b.owner_id, b.id, b.subtotal, commission, b.subtotal - commission]);
      notify(b.renter_id, 'payment_confirmed', { code: b.code, vehicle: vehicle.name }, `/bookings/${b.id}`);
      notify(b.owner_id, 'payment_confirmed', { code: b.code, vehicle: vehicle.name }, `/dashboard/owner/bookings/${b.id}`);
    } else {
      applyExtension(b, pay);
    }
    return pay;
  });
}

// ───────────────────────── Handover ─────────────────────────
interface Checklist { items: Record<string, boolean>; conditionOk: boolean; notes?: string; photoUrls?: string[] }

export function startRental(user: AuthUser, id: number, pickupCode: string, checklist: Checklist) {
  return tx(() => {
    const b = getBooking(id);
    const p = participant(b, user);
    if (!p.isOwner && !p.isAdmin) throw forbidden();
    if (b.status !== 'confirmed') throw conflict('INVALID_TRANSITION', { from: b.status });
    if (pickupCode !== b.pickup_code) throw badRequest('PICKUP_CODE_INVALID', { pickupCode: 'V_CODE' });
    if (Date.now() < new Date(b.start_at).getTime() - 60 * 60_000) throw conflict('TOO_EARLY_FOR_PICKUP');
    q.run(`INSERT INTO handover_checklists (booking_id, stage, submitted_by, items, condition_ok, notes, photo_urls) VALUES (?, 'pickup', ?, ?, ?, ?, ?)`,
      [id, user.id, JSON.stringify(checklist.items), checklist.conditionOk ? 1 : 0, checklist.notes ?? null, JSON.stringify(checklist.photoUrls ?? [])]);
    transition(b, 'active', user.id, undefined, { picked_up_at: nowIso() });
    notify(b.renter_id, 'rental_started', { code: b.code }, `/bookings/${id}`);
    return getBooking(id);
  });
}

export function completeRental(user: AuthUser, id: number, checklist: Checklist) {
  return tx(() => {
    const b = getBooking(id);
    const p = participant(b, user);
    if (!p.isOwner && !p.isAdmin) throw forbidden();
    if (b.status !== 'active') throw conflict('INVALID_TRANSITION', { from: b.status });
    const returnedAt = new Date();
    q.run(`INSERT INTO handover_checklists (booking_id, stage, submitted_by, items, condition_ok, notes, photo_urls) VALUES (?, 'return', ?, ?, ?, ?, ?)`,
      [id, user.id, JSON.stringify(checklist.items), checklist.conditionOk ? 1 : 0, checklist.notes ?? null, JSON.stringify(checklist.photoUrls ?? [])]);

    // Late fee: per started hour beyond the grace period, at the hourly-equivalent rate × multiplier.
    const lateMin = (returnedAt.getTime() - new Date(b.end_at).getTime()) / 60000 - getNumberSetting('late_grace_minutes');
    let lateFee = 0;
    if (lateMin > 0) {
      const tiers = q.all<Tier>('SELECT duration_minutes, price FROM vehicle_pricing WHERE vehicle_id = ? ORDER BY duration_minutes', [b.vehicle_id]);
      const hourly = quote(tiers, 60)!.subtotal;
      lateFee = Math.ceil(lateMin / 60) * Math.round(hourly * getNumberSetting('late_fee_multiplier'));
    }
    transition(b, 'completed', user.id, undefined, { returned_at: returnedAt.toISOString(), late_fee: lateFee });

    const ledger = (userId: number | null, type: string, amount: number, desc?: string) =>
      amount > 0 && q.run('INSERT INTO transactions (booking_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)', [id, userId, type, amount, desc ?? null]);
    const captured = Math.min(lateFee, b.deposit);
    if (lateFee > 0) {
      ledger(b.renter_id, 'late_fee', lateFee);
      ledger(b.renter_id, 'deposit_capture', captured, 'late_fee');
      const lateCommission = Math.round(lateFee * b.commission_rate);
      q.run(`UPDATE owner_earnings SET gross = gross + ?, commission = commission + ?, net = net + ? WHERE booking_id = ?`,
        [lateFee, lateCommission, lateFee - lateCommission, id]);
    }
    if (checklist.conditionOk) {
      ledger(b.renter_id, 'deposit_release', b.deposit - captured);
    } else {
      // Damage reported: deposit stays held and a dispute goes to the admin queue.
      q.run(`INSERT INTO disputes (booking_id, opened_by, reason, details, claimed_amount) VALUES (?, ?, 'damage', ?, ?)`,
        [id, user.id, checklist.notes ?? null, b.deposit - captured]);
      notify(b.renter_id, 'dispute_opened', { code: b.code }, `/bookings/${id}`);
    }
    q.run(`UPDATE owner_earnings SET status = 'available', updated_at = ? WHERE booking_id = ?`, [nowIso(), id]);
    notify(b.renter_id, 'review_request', { code: b.code }, `/bookings/${id}`);
    notify(b.owner_id, 'review_request', { code: b.code }, `/dashboard/owner/bookings/${id}`);
    return getBooking(id);
  });
}

// ───────────────────────── Cancellation ─────────────────────────
export function cancelBooking(user: AuthUser, id: number, reason?: string) {
  return tx(() => {
    const b = getBooking(id);
    const p = participant(b, user);
    expireIfDue(b);
    if (!['pending', 'accepted', 'confirmed'].includes(b.status)) throw conflict('NOT_CANCELLABLE', { status: b.status });
    let refund = 0;
    if (b.status === 'confirmed') {
      const hoursBefore = (new Date(b.start_at).getTime() - Date.now()) / 3600_000;
      const free = p.isOwner || p.isAdmin || hoursBefore >= getNumberSetting('cancellation_free_hours');
      const subtotalRefund = free ? b.subtotal : Math.round((b.subtotal * getNumberSetting('late_cancellation_refund_pct')) / 100);
      refund = subtotalRefund + b.deposit;
      const pay = q.get<any>(`SELECT * FROM payments WHERE booking_id = ? AND purpose = 'booking' AND status = 'succeeded'`, [id]);
      if (pay) {
        getProvider(pay.provider).refund(pay.provider_ref, refund);
        q.run('UPDATE payments SET status = ? WHERE id = ?', [refund >= pay.amount ? 'refunded' : 'partially_refunded', pay.id]);
      }
      q.run(`INSERT INTO transactions (booking_id, user_id, type, amount, description) VALUES (?, ?, 'refund', ?, ?)`,
        [id, b.renter_id, refund, free ? 'full_refund' : 'partial_refund']);
      const kept = b.subtotal - subtotalRefund;
      if (kept > 0) {
        const commission = Math.round(kept * b.commission_rate);
        q.run(`UPDATE owner_earnings SET gross = ?, commission = ?, net = ?, status = 'available', updated_at = ? WHERE booking_id = ?`,
          [kept, commission, kept - commission, nowIso(), id]);
      } else {
        q.run(`UPDATE owner_earnings SET status = 'reversed', updated_at = ? WHERE booking_id = ?`, [nowIso(), id]);
      }
    } else {
      q.run(`UPDATE payments SET status = 'expired' WHERE booking_id = ? AND status = 'pending'`, [id]);
    }
    transition(b, 'cancelled', user.id, reason, { cancelled_by: user.id, cancel_reason: reason ?? null, refund_amount: refund });
    const vehicle = q.get<any>('SELECT name FROM vehicles WHERE id = ?', [b.vehicle_id]);
    const other = p.isRenter ? b.owner_id : b.renter_id;
    notify(other, 'booking_cancelled', { code: b.code, vehicle: vehicle.name }, p.isRenter ? `/dashboard/owner/bookings/${id}` : `/bookings/${id}`);
    if (p.isAdmin) notify(b.renter_id, 'booking_cancelled', { code: b.code, vehicle: vehicle.name }, `/bookings/${id}`);
    return getBooking(id);
  });
}

// ───────────────────────── Extension ─────────────────────────
export function requestExtension(user: AuthUser, id: number, newEnd: string, method: PaymentMethod) {
  return tx(() => {
    const b = getBooking(id);
    const p = participant(b, user);
    if (!p.isRenter) throw forbidden();
    if (!['confirmed', 'active'].includes(b.status)) throw conflict('NOT_EXTENDABLE');
    const end = new Date(newEnd).toISOString();
    if (end <= b.end_at) throw badRequest('VALIDATION_FAILED', { newEnd: 'V_END_BEFORE_START' });
    const v = loadVehicle(b.vehicle_id);
    const problem = checkAvailability({ ...v, status: 'active' }, b.start_at, end, { excludeBookingId: id, skipStartChecks: true });
    if (problem) throw conflict(problem);
    const tiers = q.all<Tier>('SELECT duration_minutes, price FROM vehicle_pricing WHERE vehicle_id = ? ORDER BY duration_minutes', [b.vehicle_id]);
    const newSubtotal = quote(tiers, (new Date(end).getTime() - new Date(b.start_at).getTime()) / 60000)!.subtotal;
    const amount = Math.max(newSubtotal - b.subtotal, 1000);
    q.run(`UPDATE booking_extensions SET status = 'failed' WHERE booking_id = ? AND status = 'awaiting_payment'`, [id]);
    const { id: extId } = q.run(`INSERT INTO booking_extensions (booking_id, old_end_at, new_end_at, amount, status) VALUES (?, ?, ?, ?, 'awaiting_payment')`,
      [id, b.end_at, end, amount]);
    const provider = getProvider(config.paymentProvider);
    const charge = provider.createCharge({ amount, method, description: `VELOX ${b.code} extension`, bookingCode: b.code });
    q.run(`INSERT INTO payments (booking_id, purpose, extension_id, provider, provider_ref, method, amount, status, is_test)
           VALUES (?, 'extension', ?, ?, ?, ?, ?, 'pending', ?)`, [id, extId, provider.name, charge.providerRef, method, amount, charge.isTest ? 1 : 0]);
    return { extensionId: extId, amount, checkoutUrl: charge.checkoutUrl };
  });
}

function applyExtension(b: any, pay: any) {
  const ext = q.get<any>('SELECT * FROM booking_extensions WHERE id = ?', [pay.extension_id]);
  const v = loadVehicle(b.vehicle_id);
  const stillFree = ['confirmed', 'active'].includes(b.status) &&
    !checkAvailability({ ...v, status: 'active' }, b.start_at, ext.new_end_at, { excludeBookingId: b.id, skipStartChecks: true });
  if (!stillFree) {
    getProvider(pay.provider).refund(pay.provider_ref, pay.amount);
    q.run(`UPDATE payments SET status = 'refunded' WHERE id = ?`, [pay.id]);
    q.run(`UPDATE booking_extensions SET status = 'failed' WHERE id = ?`, [ext.id]);
    q.run(`INSERT INTO transactions (booking_id, payment_id, user_id, type, amount, description) VALUES (?, ?, ?, 'refund', ?, 'extension_conflict')`,
      [b.id, pay.id, b.renter_id, pay.amount]);
    return;
  }
  const commission = Math.round(pay.amount * b.commission_rate);
  q.run(`UPDATE bookings SET end_at = ?, subtotal = subtotal + ?, extension_total = extension_total + ?, total = total + ?, updated_at = ? WHERE id = ?`,
    [ext.new_end_at, pay.amount, pay.amount, pay.amount, nowIso(), b.id]);
  q.run(`UPDATE booking_extensions SET status = 'applied' WHERE id = ?`, [ext.id]);
  q.run(`UPDATE owner_earnings SET gross = gross + ?, commission = commission + ?, net = net + ?, updated_at = ? WHERE booking_id = ?`,
    [pay.amount, commission, pay.amount - commission, nowIso(), b.id]);
  q.run(`INSERT INTO transactions (booking_id, payment_id, user_id, type, amount, description) VALUES (?, ?, ?, 'renter_charge', ?, 'extension')`,
    [b.id, pay.id, b.renter_id, pay.amount]);
  q.run(`INSERT INTO transactions (booking_id, payment_id, user_id, type, amount, description) VALUES (?, ?, NULL, 'platform_commission', ?, 'extension')`,
    [b.id, pay.id, commission]);
  q.run(`INSERT INTO transactions (booking_id, payment_id, user_id, type, amount, description) VALUES (?, ?, ?, 'owner_earning', ?, 'extension')`,
    [b.id, pay.id, b.owner_id, pay.amount - commission]);
  q.run('INSERT INTO booking_status_history (booking_id, from_status, to_status, note) VALUES (?, ?, ?, ?)', [b.id, b.status, b.status, 'extended']);
  notify(b.owner_id, 'rental_extended', { code: b.code }, `/dashboard/owner/bookings/${b.id}`);
  notify(b.renter_id, 'rental_extended', { code: b.code }, `/bookings/${b.id}`);
}

// ───────────────────────── Background jobs ─────────────────────────
function expireIfDue(b: any) {
  if (['pending', 'accepted'].includes(b.status) && b.expires_at && b.expires_at < nowIso()) {
    transition(b, 'expired', null, b.status === 'pending' ? 'owner_no_response' : 'payment_timeout');
    q.run(`UPDATE payments SET status = 'expired' WHERE booking_id = ? AND status = 'pending'`, [b.id]);
    notify(b.renter_id, 'booking_expired', { code: b.code }, `/bookings/${b.id}`);
  }
}

/** Runs every minute: expires stale requests/payments and sends pickup/return reminders. */
export function runScheduledJobs() {
  const due = q.all<any>(`SELECT * FROM bookings WHERE status IN ('pending','accepted') AND expires_at < ?`, [nowIso()]);
  for (const b of due) {
    try { tx(() => expireIfDue(b)); } catch { /* status changed concurrently */ }
  }
  const soon = addMinutes(new Date(), 60).toISOString();
  const remind = (sql: string, type: 'pickup_upcoming' | 'return_upcoming') => {
    for (const b of q.all<any>(sql, [nowIso(), soon])) {
      const sent = q.get(`SELECT 1 FROM notifications WHERE user_id = ? AND type = ? AND json_extract(payload, '$.code') = ?`, [b.renter_id, type, b.code]);
      if (!sent) {
        notify(b.renter_id, type, { code: b.code }, `/bookings/${b.id}`);
        notify(b.owner_id, type, { code: b.code }, `/dashboard/owner/bookings/${b.id}`);
      }
    }
  };
  remind(`SELECT * FROM bookings WHERE status = 'confirmed' AND start_at BETWEEN ? AND ?`, 'pickup_upcoming');
  remind(`SELECT * FROM bookings WHERE status = 'active' AND end_at BETWEEN ? AND ?`, 'return_upcoming');
}
