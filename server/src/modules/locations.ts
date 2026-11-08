import { z } from 'zod';
import { q } from '../db/index.ts';
import { Router, validate, notFound, conflict } from '../lib/http.ts';
import { requireRole } from '../auth/middleware.ts';

/**
 * Location hierarchy: country → province → city/regency → district → neighbourhood.
 * New cities are data, not code: admins add them from the dashboard and they appear everywhere.
 */
export const locationRoutes = (r: Router) => {
  r.get('/api/stats', (_req, res) => {
    res.json(q.get(`SELECT
      (SELECT COUNT(*) FROM vehicles WHERE status = 'active') AS vehicles,
      (SELECT COUNT(DISTINCT city_id) FROM vehicles WHERE status = 'active') AS cities,
      (SELECT COUNT(DISTINCT v.city_id) FROM vehicles v JOIN locations c ON c.id = v.city_id JOIN locations p ON p.id = c.parent_id WHERE v.status = 'active' AND p.slug = 'prov-bali') AS bali_areas,
      (SELECT COUNT(*) FROM universities WHERE is_active = 1) AS universities,
      (SELECT COUNT(*) FROM bookings WHERE status = 'completed') AS completed`));
  });

  r.get('/api/locations/cities', (_req, res) => {
    const items = q.all(`
      SELECT c.id, c.name, c.slug, c.lat, c.lng, c.utc_offset_minutes, p.name AS province, p.slug AS province_slug,
        (SELECT COUNT(*) FROM vehicles v WHERE v.city_id = c.id AND v.status = 'active') AS vehicle_count
      FROM locations c LEFT JOIN locations p ON p.id = c.parent_id
      WHERE c.type = 'city' AND c.is_active = 1 ORDER BY (p.slug = 'prov-bali') DESC, vehicle_count DESC, c.name`);
    res.json({ items });
  });

  r.get('/api/locations/:id/children', (req, res) => {
    res.json({ items: q.all('SELECT id, type, name, slug, lat, lng FROM locations WHERE parent_id = ? AND is_active = 1 ORDER BY name',
      [Number(req.params.id)]) });
  });

  r.get('/api/universities', (req, res) => {
    const cityId = req.query.get('cityId');
    const items = q.all(`
      SELECT u.id, u.name, u.short_name, u.slug, u.lat, u.lng, u.city_id, c.name AS city_name, p.slug AS province_slug,
        (SELECT COUNT(*) FROM user_profiles p WHERE p.university_id = u.id) AS member_count,
        (SELECT COUNT(*) FROM vehicles v WHERE v.university_id = u.id AND v.status = 'active') AS vehicle_count
      FROM universities u JOIN locations c ON c.id = u.city_id LEFT JOIN locations p ON p.id = c.parent_id
      WHERE u.is_active = 1 ${cityId ? 'AND u.city_id = ?' : ''} ORDER BY (p.slug = 'prov-bali') DESC, vehicle_count DESC, u.name`,
      cityId ? [Number(cityId)] : []);
    res.json({ items });
  });

  /** University dashboard: community stats. */
  r.get('/api/universities/:slug', (req, res) => {
    const u = q.get<any>(`SELECT u.*, c.name AS city_name FROM universities u JOIN locations c ON c.id = u.city_id WHERE u.slug = ?`,
      [req.params.slug]);
    if (!u) throw notFound();
    const stats = q.get(`
      SELECT
        (SELECT COUNT(*) FROM user_profiles WHERE university_id = $id) AS registered_students,
        (SELECT COUNT(*) FROM user_profiles WHERE university_id = $id AND university_verified = 1) AS verified_members,
        (SELECT COUNT(*) FROM vehicles WHERE university_id = $id AND status = 'active' AND category = 'bicycle') AS bicycles,
        (SELECT COUNT(*) FROM vehicles WHERE university_id = $id AND status = 'active' AND category = 'motorcycle') AS motorcycles,
        (SELECT COUNT(*) FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id WHERE v.university_id = $id AND b.status = 'active') AS active_rentals,
        (SELECT COUNT(*) FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id WHERE v.university_id = $id AND b.status = 'completed') AS completed_bookings`,
      { $id: u.id } as any);
    res.json({ university: u, stats });
  });

  // ── Admin: add cities / universities without code changes ──
  r.post('/api/admin/locations', requireRole('admin'), (req, res) => {
    const b = validate(z.object({
      parentId: z.number().int().positive().nullable(),
      type: z.enum(['province', 'city', 'district', 'neighborhood']),
      name: z.string().trim().min(2).max(80),
      lat: z.number().min(-11.5).max(6.5).optional(),
      lng: z.number().min(94).max(141.5).optional(),
      utcOffsetMinutes: z.union([z.literal(420), z.literal(480), z.literal(540)]).default(420),
    }), req.body);
    const slug = b.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (q.get('SELECT 1 FROM locations WHERE slug = ?', [slug])) throw conflict('SLUG_TAKEN');
    const { id } = q.run(`INSERT INTO locations (parent_id, type, name, slug, lat, lng, utc_offset_minutes) VALUES (?,?,?,?,?,?,?)`,
      [b.parentId, b.type, b.name, slug, b.lat ?? null, b.lng ?? null, b.utcOffsetMinutes]);
    res.status(201).json({ id });
  });

  r.get('/api/admin/locations', requireRole('admin'), (_req, res) => {
    res.json({ items: q.all(`SELECT l.*, p.name AS parent_name FROM locations l LEFT JOIN locations p ON p.id = l.parent_id
                             WHERE l.type IN ('province','city') ORDER BY l.type, l.name`) });
  });

  r.patch('/api/admin/locations/:id', requireRole('admin'), (req, res) => {
    const b = validate(z.object({ isActive: z.boolean() }), req.body);
    q.run('UPDATE locations SET is_active = ? WHERE id = ?', [b.isActive ? 1 : 0, Number(req.params.id)]);
    res.json({ ok: true });
  });
};
