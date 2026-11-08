import { q } from '../db/index.ts';
import { Router, unauthorized } from '../lib/http.ts';
import { requireAuth } from '../auth/middleware.ts';

/**
 * Notification architecture.
 * notify() writes the in-app notification and fans out to every registered channel.
 * Payloads are structured data (type + params); text is rendered by the client from locale files,
 * so each user sees notifications in their own language.
 */

export type NotificationType =
  | 'booking_requested' | 'booking_accepted' | 'booking_rejected' | 'booking_expired'
  | 'payment_confirmed' | 'payment_failed' | 'booking_cancelled' | 'rental_started'
  | 'rental_completed' | 'pickup_upcoming' | 'return_upcoming' | 'rental_extended'
  | 'new_message' | 'review_request' | 'verification_approved' | 'verification_rejected'
  | 'account_suspended' | 'listing_suspended' | 'dispute_opened' | 'dispute_updated';

export interface NotificationChannel {
  name: string;
  send(userId: number, type: NotificationType, payload: Record<string, unknown>, link?: string): void;
}

/** Email and push channels plug in here (e.g. AWS SES / Firebase Cloud Messaging). Disabled in the MVP. */
const channels: NotificationChannel[] = [];
export const registerChannel = (c: NotificationChannel) => channels.push(c);

export function notify(userId: number, type: NotificationType, payload: Record<string, unknown> = {}, link?: string) {
  q.run('INSERT INTO notifications (user_id, type, payload, link) VALUES (?, ?, ?, ?)',
    [userId, type, JSON.stringify(payload), link ?? null]);
  for (const c of channels) {
    try { c.send(userId, type, payload, link); } catch { /* channel failures must not break the request */ }
  }
}

export const notificationRoutes = (r: Router) => {
  r.get('/api/notifications', requireAuth, (req, res) => {
    if (!req.user) throw unauthorized();
    const items = q.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id])
      .map((n: any) => ({ ...n, payload: JSON.parse(n.payload) }));
    const unread = q.get<{ c: number }>('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.id])!.c;
    res.json({ items, unread });
  });
  r.post('/api/notifications/read-all', requireAuth, (req, res) => {
    q.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
      [new Date().toISOString(), req.user!.id]);
    res.json({ ok: true });
  });
  r.post('/api/notifications/:id/read', requireAuth, (req, res) => {
    q.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?',
      [new Date().toISOString(), Number(req.params.id), req.user!.id]);
    res.json({ ok: true });
  });
};
