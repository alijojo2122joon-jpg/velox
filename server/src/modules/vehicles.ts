import { z } from 'zod';
import { q, tx } from '../db/index.ts';
import { Router, validate, notFound, forbidden, badRequest, type Req } from '../lib/http.ts';
import { requireAuth, requireRole } from '../auth/middleware.ts';
import { storeUpload } from '../lib/storage.ts';
import { haversineKm } from '../lib/util.ts';
import { quote, ALLOWED_TIERS, type Tier } from './bookings/pricing.ts';
import { busyIntervals, checkAvailability, BLOCKING_STATUSES } from './bookings/availability.ts';

export const BICYCLE_TYPES = ['mountain', 'city', 'road', 'folding', 'electric_bicycle', 'student'] as const;
export const MOTORCYCLE_TYPES = ['scooter', 'automatic', 'manual', 'electric_motorcycle'] as const;
const PAGE_SIZE = 12;

/** Local weekday/minute for a timestamp, evaluated per row in the vehicle city's UTC offset. */
const localWeekday = (p: string) => `CAST(strftime('%w', ${p}, '+' || c.utc_offset_minutes || ' minutes') AS INTEGER)`;
const localMinute = (p: string) =>
  `(CAST(strftime('%H', ${p}, '+' || c.utc_offset_minutes || ' minutes') AS INTEGER) * 60 + CAST(strftime('%M', ${p}, '+' || c.utc_offset_minutes || ' minutes') AS INTEGER))`;

const searchSchema = z.object({
  q: z.string().max(80).optional(),
  category: z.enum(['bicycle', 'motorcycle']).optional(),
  type: z.string().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  region: z.string().regex(/^[a-z-]{2,40}$/).optional(), // province slug without 'prov-', e.g. 'bali'
  universityId: z.coerce.number().int().positive().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.2).max(100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  availableNow: z.enum(['1', 'true']).optional(),
  sort: z.enum(['nearest', 'price', 'rating', 'newest', 'available_now']).default('newest'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  bounds: z.string().regex(/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/).optional(), // south,west,north,east for map view
});

export function searchVehicles(params: Record<string, string>) {
  const f = validate(searchSchema, params);
  const where: string[] = [`v.status = 'active'`, `u.status = 'active'`];
  const args: any[] = [];

  let center: { lat: number; lng: number } | null = null;
  if (f.lat !== undefined && f.lng !== undefined) center = { lat: f.lat, lng: f.lng };
  if (f.universityId) {
    const uni = q.get<any>('SELECT lat, lng FROM universities WHERE id = ?', [f.universityId]);
    if (uni) { center = center ?? { lat: uni.lat, lng: uni.lng }; f.radiusKm = f.radiusKm ?? 5; }
  }

  if (f.category) { where.push('v.category = ?'); args.push(f.category); }
  if (f.type) {
    const types = f.type.split(',').filter((t) => (BICYCLE_TYPES as readonly string[]).concat(MOTORCYCLE_TYPES).includes(t));
    if (types.length) { where.push(`v.type IN (${types.map(() => '?').join(',')})`); args.push(...types); }
  }
  if (f.cityId) { where.push('v.city_id = ?'); args.push(f.cityId); }
  else if (f.region) {
    where.push(`v.city_id IN (SELECT id FROM locations WHERE parent_id = (SELECT id FROM locations WHERE slug = ?))`); args.push('prov-' + f.region);
  }
  if (f.q) {
    where.push(`(v.name LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR v.pickup_address LIKE ?)`);
    const like = `%${f.q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like, like);
  }
  if (f.minRating) { where.push('v.rating_avg >= ?'); args.push(f.minRating); }
  if (f.bounds) {
    const [s, w, n, e] = f.bounds.split(',').map(Number);
    where.push('v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?'); args.push(s, n, w, e);
  }

  // Spatial filter: cheap bounding-box prefilter (uses idx_vehicles_geo), exact haversine below.
  // Production: PostGIS ST_DWithin on a GIST-indexed geography column.
  let distanceExpr = 'NULL';
  if (center) {
    distanceExpr = `(6371 * 2 * asin(sqrt(power(sin(radians(v.lat - ${center.lat}) / 2), 2) +
      cos(radians(${center.lat})) * cos(radians(v.lat)) * power(sin(radians(v.lng - ${center.lng}) / 2), 2))))`;
    if (f.radiusKm) {
      const dLat = f.radiusKm / 111;
      const dLng = f.radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
      where.push('v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?');
      args.push(center.lat - dLat, center.lat + dLat, center.lng - dLng, center.lng + dLng);
      where.push(`${distanceExpr} <= ?`); args.push(f.radiusKm);
    }
  }

  // Availability: requested interval (or "now → +1h") must be free and handover times inside weekly windows.
  let start = f.start, end = f.end;
  if (!start && (f.availableNow || f.sort === 'available_now')) {
    start = new Date().toISOString();
    end = new Date(Date.now() + 3600_000).toISOString();
  }
  if (start && end) {
    if (end <= start) throw badRequest('VALIDATION_FAILED', { end: 'V_END_BEFORE_START' });
    where.push(`NOT EXISTS (SELECT 1 FROM bookings b WHERE b.vehicle_id = v.id AND b.status IN (${BLOCKING_STATUSES.map((s) => `'${s}'`).join(',')})
                AND b.start_at < ? AND b.end_at > ?)`); args.push(end, start);
    where.push(`NOT EXISTS (SELECT 1 FROM vehicle_availability a WHERE a.vehicle_id = v.id AND a.kind = 'block' AND a.block_start < ? AND a.block_end > ?)`);
    args.push(end, start);
    for (const [p, isEnd] of [[start, false], [end, true]] as const) {
      where.push(`(NOT EXISTS (SELECT 1 FROM vehicle_availability a WHERE a.vehicle_id = v.id AND a.kind = 'weekly')
        OR EXISTS (SELECT 1 FROM vehicle_availability a WHERE a.vehicle_id = v.id AND a.kind = 'weekly'
          AND a.weekday = ${localWeekday('?')} AND ${localMinute('?')} >= a.start_minute AND ${localMinute('?')} ${isEnd ? '<=' : '<'} a.end_minute))`);
      args.push(p, p, p);
    }
  }

  // Reference hourly price = smallest tier normalised to one hour.
  const priceRef = `(SELECT CAST(ROUND(vp.price * 60.0 / vp.duration_minutes) AS INTEGER) FROM vehicle_pricing vp
                     WHERE vp.vehicle_id = v.id ORDER BY vp.duration_minutes LIMIT 1)`;
  if (f.minPrice !== undefined) { where.push(`${priceRef} >= ?`); args.push(f.minPrice); }
  if (f.maxPrice !== undefined) { where.push(`${priceRef} <= ?`); args.push(f.maxPrice); }

  const order = {
    nearest: center ? 'distance_km ASC' : 'v.created_at DESC',
    price: 'price_ref ASC',
    rating: 'v.rating_avg DESC, v.rating_count DESC',
    newest: 'v.created_at DESC',
    available_now: center ? 'distance_km ASC' : 'v.rating_avg DESC',
  }[f.sort];

  const from = `FROM vehicles v JOIN users u ON u.id = v.owner_id JOIN user_profiles p ON p.user_id = v.owner_id
                JOIN locations c ON c.id = v.city_id LEFT JOIN universities un ON un.id = v.university_id
                WHERE ${where.join(' AND ')}`;
  const total = q.get<{ n: number }>(`SELECT COUNT(*) n ${from}`, args)!.n;
  const rows = q.all<any>(`
    SELECT v.id, v.name, v.brand, v.model, v.category, v.type, v.condition, v.deposit, v.lat, v.lng, v.pickup_address,
           v.rating_avg, v.rating_count, v.is_demo, v.instant_book, v.created_at, c.name AS city_name, un.short_name AS university_name,
           p.full_name AS owner_name, p.avatar_url AS owner_avatar,
           EXISTS (SELECT 1 FROM user_verifications uv WHERE uv.user_id = v.owner_id AND uv.type = 'identity' AND uv.status = 'approved') AS owner_verified,
           (SELECT url FROM vehicle_images i WHERE i.vehicle_id = v.id ORDER BY position LIMIT 1) AS cover_url,
           ${priceRef} AS price_ref, ${distanceExpr} AS distance_km
    ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, [...args, PAGE_SIZE, (f.page - 1) * PAGE_SIZE]);

  const tiers = tiersFor(rows.map((r) => r.id));
  const items = rows.map((r) => {
    const t = tiers.get(r.id) ?? [];
    const smallest = t[0];
    return {
      ...r,
      owner_verified: !!r.owner_verified,
      distance_km: r.distance_km === null ? null : Math.round(r.distance_km * 100) / 100,
      from_price: smallest ? { duration_minutes: smallest.duration_minutes, price: smallest.price } : null,
      quote: start && end ? quote(t, (new Date(end).getTime() - new Date(start).getTime()) / 60000) : null,
    };
  });
  return { items, total, page: f.page, pageSize: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) };
}

function tiersFor(ids: number[]) {
  const map = new Map<number, Tier[]>();
  if (!ids.length) return map;
  for (const t of q.all<any>(`SELECT vehicle_id, duration_minutes, price FROM vehicle_pricing WHERE vehicle_id IN (${ids.map(() => '?').join(',')})
                              ORDER BY duration_minutes`, ids)) {
    if (!map.has(t.vehicle_id)) map.set(t.vehicle_id, []);
    map.get(t.vehicle_id)!.push({ duration_minutes: t.duration_minutes, price: t.price });
  }
  return map;
}

export function loadVehicle(id: number) {
  return q.get<any>(`SELECT v.*, c.utc_offset_minutes, c.name AS city_name FROM vehicles v JOIN locations c ON c.id = v.city_id WHERE v.id = ?`, [id]);
}

function ownedVehicle(req: Req) {
  const v = loadVehicle(Number(req.params.id));
  if (!v) throw notFound();
  if (v.owner_id !== req.user!.id && req.user!.role !== 'admin') throw forbidden();
  return v;
}

const vehicleSchema = z.object({
  category: z.enum(['bicycle', 'motorcycle']),
  type: z.enum([...BICYCLE_TYPES, ...MOTORCYCLE_TYPES]),
  name: z.string().trim().min(3).max(80),
  brand: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(40),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1).optional(),
  description: z.string().trim().max(2000).default(''),
  condition: z.enum(['new', 'excellent', 'good', 'fair']),
  rules: z.string().trim().max(1000).default(''),
  deposit: z.number().int().min(0).max(10_000_000).default(0),
  cityId: z.number().int().positive(),
  universityId: z.number().int().positive().nullable().optional(),
  pickupAddress: z.string().trim().min(5).max(200),
  lat: z.number().min(-11.5).max(6.5),
  lng: z.number().min(94).max(141.5),
  plateNumber: z.string().trim().max(15).optional(),
  registrationDoc: z.string().max(6_000_000).optional(),
  insuranceNote: z.string().max(300).optional(),
  instantBook: z.boolean().default(false),
  pricing: z.array(z.object({ durationMinutes: z.number().int(), price: z.number().int().min(1000).max(50_000_000) })).min(1),
  availability: z.array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440) })).max(28).default([]),
  images: z.array(z.string().max(6_000_000)).max(8).default([]),
});

function savePricing(vehicleId: number, pricing: { durationMinutes: number; price: number }[]) {
  for (const p of pricing) if (!ALLOWED_TIERS.includes(p.durationMinutes)) throw badRequest('VALIDATION_FAILED', { pricing: 'V_INVALID' });
  q.run('DELETE FROM vehicle_pricing WHERE vehicle_id = ?', [vehicleId]);
  for (const p of pricing) q.run('INSERT INTO vehicle_pricing (vehicle_id, duration_minutes, price) VALUES (?, ?, ?)', [vehicleId, p.durationMinutes, p.price]);
}
function saveWindows(vehicleId: number, windows: { weekday: number; startMinute: number; endMinute: number }[]) {
  for (const w of windows) if (w.startMinute >= w.endMinute) throw badRequest('VALIDATION_FAILED', { availability: 'V_INVALID' });
  q.run(`DELETE FROM vehicle_availability WHERE vehicle_id = ? AND kind = 'weekly'`, [vehicleId]);
  for (const w of windows) q.run(`INSERT INTO vehicle_availability (vehicle_id, kind, weekday, start_minute, end_minute) VALUES (?, 'weekly', ?, ?, ?)`,
    [vehicleId, w.weekday, w.startMinute, w.endMinute]);
}

export const vehicleRoutes = (r: Router) => {
  r.get('/api/vehicles', (req, res) => res.json(searchVehicles(Object.fromEntries(req.query))));

  r.get('/api/vehicles/:id', (req, res) => {
    const v = q.get<any>(`
      SELECT v.*, c.name AS city_name, c.utc_offset_minutes, un.name AS university_name, un.slug AS university_slug,
             p.full_name AS owner_name, p.avatar_url AS owner_avatar, ou.created_at AS owner_since,
             EXISTS (SELECT 1 FROM user_verifications uv WHERE uv.user_id = v.owner_id AND uv.type = 'identity' AND uv.status = 'approved') AS owner_verified,
             (SELECT COUNT(*) FROM bookings b WHERE b.owner_id = v.owner_id AND b.status = 'completed') AS owner_completed,
             (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE subject_user_id = v.owner_id AND direction = 'renter_to_owner') AS owner_rating
      FROM vehicles v JOIN locations c ON c.id = v.city_id JOIN user_profiles p ON p.user_id = v.owner_id JOIN users ou ON ou.id = v.owner_id
      LEFT JOIN universities un ON un.id = v.university_id WHERE v.id = ?`, [Number(req.params.id)]);
    const isOwner = req.user && (req.user.id === v?.owner_id || req.user.role === 'admin');
    if (!v || (v.status !== 'active' && !isOwner)) throw notFound();
    delete v.registration_doc_key;
    if (!isOwner) delete v.plate_number;
    const lat = Number(req.query.get('lat')), lng = Number(req.query.get('lng'));
    const now = new Date();
    res.json({
      vehicle: { ...v, owner_verified: !!v.owner_verified,
        distance_km: Number.isFinite(lat) && Number.isFinite(lng) && req.query.has('lat') ? Math.round(haversineKm(lat, lng, v.lat, v.lng) * 100) / 100 : null },
      images: q.all('SELECT id, url, position FROM vehicle_images WHERE vehicle_id = ? ORDER BY position', [v.id]),
      pricing: q.all('SELECT duration_minutes, price FROM vehicle_pricing WHERE vehicle_id = ? ORDER BY duration_minutes', [v.id]),
      availability: q.all(`SELECT id, weekday, start_minute, end_minute FROM vehicle_availability WHERE vehicle_id = ? AND kind = 'weekly' ORDER BY weekday, start_minute`, [v.id]),
      blocks: isOwner ? q.all(`SELECT id, block_start, block_end, note FROM vehicle_availability WHERE vehicle_id = ? AND kind = 'block' AND block_end > ? ORDER BY block_start`, [v.id, now.toISOString()]) : [],
      busy: busyIntervals(v.id, now.toISOString(), new Date(now.getTime() + 60 * 86400_000).toISOString()),
      reviews: q.all(`SELECT r.id, r.rating, r.comment, r.created_at, r.is_demo, p.full_name AS author_name, p.avatar_url AS author_avatar
                      FROM reviews r JOIN user_profiles p ON p.user_id = r.author_id
                      WHERE r.vehicle_id = ? AND r.direction = 'renter_to_owner' ORDER BY r.id DESC LIMIT 20`, [v.id]),
      saved: req.user ? !!q.get('SELECT 1 FROM saved_vehicles WHERE user_id = ? AND vehicle_id = ?', [req.user.id, v.id]) : false,
    });
  });

  /** Live price + availability check for the booking widget. */
  r.get('/api/vehicles/:id/quote', (req, res) => {
    const v = loadVehicle(Number(req.params.id));
    if (!v) throw notFound();
    const { start, end } = validate(z.object({ start: z.string().datetime(), end: z.string().datetime() }), Object.fromEntries(req.query));
    const tiers = q.all<Tier>('SELECT duration_minutes, price FROM vehicle_pricing WHERE vehicle_id = ? ORDER BY duration_minutes', [v.id]);
    const problem = checkAvailability(v, start, end);
    const qt = quote(tiers, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
    res.json({ available: !problem, problem, quote: qt, deposit: v.deposit, total: qt ? qt.subtotal + v.deposit : null });
  });

  // ── Owner listing management ──
  r.get('/api/owner/vehicles', requireRole('owner'), (req, res) => {
    res.json({ items: q.all(`
      SELECT v.id, v.name, v.brand, v.model, v.category, v.type, v.status, v.registration_status, v.rating_avg, v.rating_count, v.is_demo, v.created_at,
        (SELECT url FROM vehicle_images i WHERE i.vehicle_id = v.id ORDER BY position LIMIT 1) AS cover_url,
        (SELECT MIN(price) FROM vehicle_pricing vp WHERE vp.vehicle_id = v.id) AS min_price,
        (SELECT COUNT(*) FROM bookings b WHERE b.vehicle_id = v.id AND b.status = 'completed') AS completed_count,
        (SELECT COALESCE(SUM(e.net), 0) FROM owner_earnings e WHERE e.booking_id IN (SELECT id FROM bookings WHERE vehicle_id = v.id) AND e.status <> 'reversed') AS earned
      FROM vehicles v WHERE v.owner_id = ? ORDER BY v.created_at DESC`, [req.user!.id]) });
  });

  r.post('/api/vehicles', requireRole('owner'), (req, res) => {
    const b = validate(vehicleSchema, req.body);
    const isMoto = b.category === 'motorcycle';
    if ((isMoto ? MOTORCYCLE_TYPES : BICYCLE_TYPES).indexOf(b.type as never) < 0) throw badRequest('VALIDATION_FAILED', { type: 'V_INVALID' });
    if (!q.get(`SELECT 1 FROM locations WHERE id = ? AND type = 'city'`, [b.cityId])) throw badRequest('VALIDATION_FAILED', { cityId: 'V_INVALID' });
    if (isMoto && (!b.plateNumber || !b.registrationDoc)) throw badRequest('VALIDATION_FAILED', { registrationDoc: 'V_REQUIRED' });
    const regKey = isMoto && b.registrationDoc ? storeUpload(b.registrationDoc, 'private', true) : null;
    const imageKeys = b.images.map((img) => storeUpload(img, 'public'));
    const id = tx(() => {
      const { id } = q.run(`
        INSERT INTO vehicles (owner_id, category, type, name, brand, model, year, description, condition, rules, deposit, city_id, university_id,
          pickup_address, lat, lng, plate_number, registration_doc_key, registration_status, insurance_note, status, instant_book)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [req.user!.id, b.category, b.type, b.name, b.brand, b.model, b.year ?? null, b.description, b.condition, b.rules, b.deposit, b.cityId,
          b.universityId ?? null, b.pickupAddress, b.lat, b.lng, b.plateNumber ?? null, regKey, isMoto ? 'pending' : 'not_required',
          b.insuranceNote ?? null, isMoto ? 'pending_review' : 'active', b.instantBook ? 1 : 0]);
      savePricing(id, b.pricing);
      saveWindows(id, b.availability);
      imageKeys.forEach((k, i) => q.run('INSERT INTO vehicle_images (vehicle_id, url, position) VALUES (?, ?, ?)', [id, '/uploads/' + k, i]));
      return id;
    });
    res.status(201).json({ id, listingStatus: isMoto ? 'pending_review' : 'active' });
  });

  r.patch('/api/vehicles/:id', requireRole('owner'), (req, res) => {
    const v = ownedVehicle(req);
    const b = validate(vehicleSchema.partial().omit({ category: true, pricing: true, availability: true, images: true, registrationDoc: true })
      .extend({ status: z.enum(['active', 'paused', 'maintenance']).optional() }), req.body);
    if (b.status === 'active' && ['suspended', 'pending_review'].includes(v.status)) throw forbidden('LISTING_UNDER_REVIEW');
    const map: Record<string, string> = { type: 'type', name: 'name', brand: 'brand', model: 'model', year: 'year', description: 'description',
      condition: 'condition', rules: 'rules', deposit: 'deposit', cityId: 'city_id', universityId: 'university_id', pickupAddress: 'pickup_address',
      lat: 'lat', lng: 'lng', insuranceNote: 'insurance_note', status: 'status' };
    const sets: string[] = [], vals: any[] = [];
    for (const [k, col] of Object.entries(map)) if ((b as any)[k] !== undefined) { sets.push(`${col} = ?`); vals.push((b as any)[k]); }
    if (b.instantBook !== undefined) { sets.push('instant_book = ?'); vals.push(b.instantBook ? 1 : 0); }
    if (sets.length) q.run(`UPDATE vehicles SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...vals, new Date().toISOString(), v.id]);
    res.json({ ok: true });
  });

  r.put('/api/vehicles/:id/pricing', requireRole('owner'), (req, res) => {
    const v = ownedVehicle(req);
    const b = validate(vehicleSchema.pick({ pricing: true }), req.body);
    tx(() => savePricing(v.id, b.pricing));
    res.json({ ok: true });
  });

  r.put('/api/vehicles/:id/availability', requireRole('owner'), (req, res) => {
    const v = ownedVehicle(req);
    const b = validate(vehicleSchema.pick({ availability: true }), req.body);
    tx(() => saveWindows(v.id, b.availability));
    res.json({ ok: true });
  });

  r.post('/api/vehicles/:id/blocks', requireRole('owner'), (req, res) => {
    const v = ownedVehicle(req);
    const b = validate(z.object({ start: z.string().datetime(), end: z.string().datetime(), note: z.string().max(120).optional() }), req.body);
    if (b.end <= b.start) throw badRequest('VALIDATION_FAILED', { end: 'V_END_BEFORE_START' });
    const { id } = q.run(`INSERT INTO vehicle_availability (vehicle_id, kind, block_start, block_end, note) VALUES (?, 'block', ?, ?, ?)`,
      [v.id, new Date(b.start).toISOString(), new Date(b.end).toISOString(), b.note ?? null]);
    res.status(201).json({ id });
  });

  r.delete('/api/vehicles/:id/blocks/:blockId', requireRole('owner'), (req, res) => {
    const v = ownedVehicle(req);
    q.run(`DELETE FROM vehicle_availability WHERE id = ? AND vehicle_id = ? AND kind = 'block'`, [Number(req.params.blockId), v.id]);
    res.json({ ok: true });
  });

  r.post('/api/vehicles/:id/images', requireRole('owner'), (req, res) => {
    const v = ownedVehicle(req);
    const b = validate(z.object({ image: z.string().max(6_000_000) }), req.body);
    const count = q.get<{ n: number }>('SELECT COUNT(*) n FROM vehicle_images WHERE vehicle_id = ?', [v.id])!.n;
    if (count >= 8) throw badRequest('TOO_MANY_IMAGES');
    const key = storeUpload(b.image, 'public');
    q.run('INSERT INTO vehicle_images (vehicle_id, url, position) VALUES (?, ?, ?)', [v.id, '/uploads/' + key, count]);
    res.status(201).json({ ok: true });
  });

  r.delete('/api/vehicles/:id/images/:imageId', requireRole('owner'), (req, res) => {
    const v = ownedVehicle(req);
    q.run('DELETE FROM vehicle_images WHERE id = ? AND vehicle_id = ?', [Number(req.params.imageId), v.id]);
    res.json({ ok: true });
  });

  // ── Saved vehicles ──
  r.post('/api/vehicles/:id/save', requireAuth, (req, res) => {
    q.run('INSERT OR IGNORE INTO saved_vehicles (user_id, vehicle_id) VALUES (?, ?)', [req.user!.id, Number(req.params.id)]);
    res.json({ saved: true });
  });
  r.delete('/api/vehicles/:id/save', requireAuth, (req, res) => {
    q.run('DELETE FROM saved_vehicles WHERE user_id = ? AND vehicle_id = ?', [req.user!.id, Number(req.params.id)]);
    res.json({ saved: false });
  });
  r.get('/api/me/saved', requireAuth, (req, res) => {
    res.json({ items: q.all(`
      SELECT v.id, v.name, v.brand, v.model, v.category, v.type, v.rating_avg, v.rating_count, v.is_demo, v.status, c.name AS city_name,
        (SELECT url FROM vehicle_images i WHERE i.vehicle_id = v.id ORDER BY position LIMIT 1) AS cover_url,
        (SELECT json_object('duration_minutes', duration_minutes, 'price', price) FROM vehicle_pricing vp WHERE vp.vehicle_id = v.id ORDER BY duration_minutes LIMIT 1) AS from_price
      FROM saved_vehicles s JOIN vehicles v ON v.id = s.vehicle_id JOIN locations c ON c.id = v.city_id
      WHERE s.user_id = ? ORDER BY s.created_at DESC`, [req.user!.id]).map((r: any) => ({ ...r, from_price: r.from_price ? JSON.parse(r.from_price) : null })) });
  });
};
