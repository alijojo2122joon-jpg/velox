import { q } from '../../db/index.ts';

/** Statuses that hold the vehicle's time slot. Anything else frees it. */
export const BLOCKING_STATUSES = ['pending', 'accepted', 'confirmed', 'active'] as const;
const BLOCKING_SQL = BLOCKING_STATUSES.map((s) => `'${s}'`).join(',');

export interface Window { weekday: number; start_minute: number; end_minute: number }

const localParts = (iso: string, offsetMin: number) => {
  const d = new Date(new Date(iso).getTime() + offsetMin * 60_000);
  return { weekday: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
};

/** Handover (pickup / return) must fall inside one of the owner's weekly windows, in the vehicle's local time. */
export function insideWindows(windows: Window[], iso: string, offsetMin: number, isEnd = false) {
  if (!windows.length) return true; // no schedule = available 24/7
  const { weekday, minute } = localParts(iso, offsetMin);
  return windows.some((w) => w.weekday === weekday && minute >= w.start_minute && (isEnd ? minute <= w.end_minute : minute < w.end_minute));
}

export function overlappingBooking(vehicleId: number, startAt: string, endAt: string, excludeId?: number) {
  return q.get<{ id: number }>(
    `SELECT id FROM bookings WHERE vehicle_id = ? AND status IN (${BLOCKING_SQL})
     AND start_at < ? AND end_at > ? ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [vehicleId, endAt, startAt, excludeId] : [vehicleId, endAt, startAt]);
}

export function overlappingBlock(vehicleId: number, startAt: string, endAt: string) {
  return q.get(`SELECT id FROM vehicle_availability WHERE vehicle_id = ? AND kind = 'block' AND block_start < ? AND block_end > ? LIMIT 1`,
    [vehicleId, endAt, startAt]);
}

export type AvailabilityProblem =
  | 'START_IN_PAST' | 'TOO_FAR_AHEAD' | 'TOO_LONG' | 'TOO_SHORT' | 'OUTSIDE_HOURS' | 'BLOCKED' | 'ALREADY_BOOKED' | 'NOT_LISTED';

export function checkAvailability(vehicle: { id: number; status: string; utc_offset_minutes: number },
  startAt: string, endAt: string, opts: { excludeBookingId?: number; skipStartChecks?: boolean } = {}): AvailabilityProblem | null {
  if (vehicle.status !== 'active') return 'NOT_LISTED';
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  if (!opts.skipStartChecks) {
    if (s < Date.now() - 5 * 60_000) return 'START_IN_PAST';
    if (s > Date.now() + 90 * 86400_000) return 'TOO_FAR_AHEAD';
  }
  if (e - s < 30 * 60_000) return 'TOO_SHORT';
  if (e - s > 30 * 86400_000) return 'TOO_LONG';
  const windows = q.all<Window>(`SELECT weekday, start_minute, end_minute FROM vehicle_availability WHERE vehicle_id = ? AND kind = 'weekly'`, [vehicle.id]);
  if ((!opts.skipStartChecks && !insideWindows(windows, startAt, vehicle.utc_offset_minutes)) ||
      !insideWindows(windows, endAt, vehicle.utc_offset_minutes, true)) return 'OUTSIDE_HOURS';
  if (overlappingBlock(vehicle.id, startAt, endAt)) return 'BLOCKED';
  if (overlappingBooking(vehicle.id, startAt, endAt, opts.excludeBookingId)) return 'ALREADY_BOOKED';
  return null;
}

/** Busy intervals for the availability calendar (no renter details exposed). */
export function busyIntervals(vehicleId: number, fromIso: string, toIso: string) {
  const bookings = q.all(`SELECT start_at, end_at FROM bookings WHERE vehicle_id = ? AND status IN (${BLOCKING_SQL})
                          AND start_at < ? AND end_at > ? ORDER BY start_at`, [vehicleId, toIso, fromIso]);
  const blocks = q.all(`SELECT block_start AS start_at, block_end AS end_at FROM vehicle_availability
                        WHERE vehicle_id = ? AND kind = 'block' AND block_start < ? AND block_end > ?`, [vehicleId, toIso, fromIso]);
  return [...bookings.map((b: any) => ({ ...b, kind: 'booked' })), ...blocks.map((b: any) => ({ ...b, kind: 'blocked' }))];
}
