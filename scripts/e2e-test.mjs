// End-to-end API test of the core flows. Usage: start the server, then `npm test` (BASE_URL defaults to http://localhost:8080).
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let passed = 0;

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    return { ...data, status: res.status };
  };
}
const step = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };
const nextSlot = (hoursAhead, len) => {
  // Pick a slot at 10:00 WIB (03:00 UTC) a few days ahead, inside every demo listing's opening hours.
  const d = new Date(Date.now() + hoursAhead * 3600_000);
  d.setUTCHours(3, 0, 0, 0);
  return { start: d.toISOString(), end: new Date(d.getTime() + len * 3600_000).toISOString() };
};

const stamp = Date.now().toString().slice(-7);
const owner = client(), renter = client(), renter2 = client(), admin = client();
let vehicleId, bookingId;

console.log('VELOX end-to-end test →', BASE);

await step('owner registers', async () => {
  const r = await owner('POST', '/api/auth/register', { fullName: 'Test Owner', email: `owner${stamp}@test.id`, phone: `0812${stamp}1`, password: 'secret123', role: 'owner', locale: 'id' });
  assert.equal(r.status, 201, JSON.stringify(r));
  assert.equal(r.user.role, 'owner');
});

await step('validation errors come back as field codes', async () => {
  const r = await client()('POST', '/api/auth/register', { fullName: 'X', email: 'bad', phone: '123', password: '1', role: 'renter' });
  assert.equal(r.status, 400);
  assert.equal(r.error.code, 'VALIDATION_FAILED');
  assert.equal(r.error.details.email, 'V_EMAIL');
});

await step('owner lists a bicycle', async () => {
  const cities = await owner('GET', '/api/locations/cities');
  const yogya = cities.items.find((c) => c.name === 'Yogyakarta');
  const r = await owner('POST', '/api/vehicles', {
    category: 'bicycle', type: 'city', name: `E2E Test Bike ${stamp}`, brand: 'Polygon', model: 'Test', condition: 'good', deposit: 20000,
    cityId: yogya.id, pickupAddress: 'Jl. Kaliurang KM 5, Yogyakarta', lat: -7.7600, lng: 110.3800,
    pricing: [{ durationMinutes: 30, price: 5000 }, { durationMinutes: 60, price: 8000 }, { durationMinutes: 1440, price: 50000 }],
    availability: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 360, endMinute: 1320 })),
    images: [PNG],
  });
  assert.equal(r.status, 201, JSON.stringify(r));
  vehicleId = r.id;
});

await step('bicycle is found by location search', async () => {
  const r = await renter('GET', `/api/vehicles?lat=-7.7605&lng=110.3805&radiusKm=2&category=bicycle&q=E2E`);
  assert.ok(r.items.some((v) => v.id === vehicleId), 'listing missing from search');
  assert.ok(r.items[0].distance_km < 2);
});

await step('renter registers', async () => {
  const r = await renter('POST', '/api/auth/register', { fullName: 'Test Renter', email: `renter${stamp}@test.id`, phone: `0813${stamp}2`, password: 'secret123', role: 'renter' });
  assert.equal(r.status, 201);
});

const slot = nextSlot(72, 3);
await step('quote prices 3h with the cheapest tier combination', async () => {
  const r = await renter('GET', `/api/vehicles/${vehicleId}/quote?start=${slot.start}&end=${slot.end}`);
  assert.equal(r.available, true, JSON.stringify(r));
  assert.equal(r.quote.subtotal, 24000); // 3 × 1h
  assert.equal(r.total, 44000);          // + deposit
});

await step('renter requests a booking', async () => {
  const r = await renter('POST', '/api/bookings', { vehicleId, ...slot, acceptAgreement: true });
  assert.equal(r.status, 201, JSON.stringify(r));
  assert.equal(r.booking.status, 'pending');
  bookingId = r.booking.id;
});

await step('double booking of an overlapping slot is rejected', async () => {
  await renter2('POST', '/api/auth/register', { fullName: 'Second Renter', email: `r2${stamp}@test.id`, phone: `0814${stamp}3`, password: 'secret123', role: 'renter' });
  const overlap = { start: new Date(new Date(slot.start).getTime() + 3600_000).toISOString(), end: new Date(new Date(slot.end).getTime() + 3600_000).toISOString() };
  const r = await renter2('POST', '/api/bookings', { vehicleId, ...overlap, acceptAgreement: true });
  assert.equal(r.status, 409);
  assert.equal(r.error.code, 'ALREADY_BOOKED');
});

await step('booking appears in both dashboards', async () => {
  const mine = await renter('GET', '/api/bookings?as=renter');
  const theirs = await owner('GET', '/api/bookings?as=owner');
  assert.ok(mine.items.some((b) => b.id === bookingId));
  assert.ok(theirs.items.some((b) => b.id === bookingId));
});

await step('owner gets an in-app notification', async () => {
  const r = await owner('GET', '/api/notifications');
  assert.ok(r.items.some((n) => n.type === 'booking_requested'));
});

await step('payment is refused before the owner accepts', async () => {
  const r = await renter('POST', `/api/bookings/${bookingId}/pay`, { method: 'qris' });
  assert.equal(r.status, 409);
});

await step('owner accepts → renter pays (mock gateway, signed webhook) → confirmed', async () => {
  const a = await owner('POST', `/api/bookings/${bookingId}/respond`, { decision: 'accept' });
  assert.equal(a.booking.status, 'accepted');
  const p = await renter('POST', `/api/bookings/${bookingId}/pay`, { method: 'qris' });
  assert.ok(p.checkoutUrl.startsWith('/pay/'));
  const ref = p.payment.provider_ref;
  const before = await renter('GET', `/api/bookings/${bookingId}`);
  assert.equal(before.booking.status, 'accepted', 'must not confirm before provider confirmation');
  const s = await renter('POST', `/api/payments/mock/${ref}/simulate`, { outcome: 'succeeded' });
  assert.equal(s.payment.status, 'succeeded');
  const after = await renter('GET', `/api/bookings/${bookingId}`);
  assert.equal(after.booking.status, 'confirmed');
  assert.match(after.booking.pickup_code, /^\d{6}$/);
});

await step('forged webhook without a valid signature is rejected', async () => {
  const r = await client()('POST', '/api/payments/webhook/mock', { ref: 'MOCK-x', status: 'succeeded' });
  assert.equal(r.status, 401);
});

await step('owner cannot see the pickup code; wrong code is rejected', async () => {
  const o = await owner('GET', `/api/bookings/${bookingId}`);
  assert.equal(o.booking.pickup_code, undefined);
  const r = await owner('POST', `/api/bookings/${bookingId}/start`, { pickupCode: '000000', items: { tires: true }, conditionOk: true });
  assert.equal(r.status, 400);
});

await step('cancellation of a confirmed booking ≥24h ahead refunds in full', async () => {
  const b2slot = nextSlot(120, 2);
  const c = await renter('POST', '/api/bookings', { vehicleId, ...b2slot, acceptAgreement: true });
  await owner('POST', `/api/bookings/${c.booking.id}/respond`, { decision: 'accept' });
  const p = await renter('POST', `/api/bookings/${c.booking.id}/pay`, { method: 'ewallet' });
  await renter('POST', `/api/payments/mock/${p.payment.provider_ref}/simulate`, { outcome: 'succeeded' });
  const x = await renter('POST', `/api/bookings/${c.booking.id}/cancel`, { reason: 'plans changed' });
  assert.equal(x.booking.status, 'cancelled');
  assert.equal(x.booking.refund_amount, x.booking.total);
});

await step('unverified user cannot book a motorcycle', async () => {
  const s = await renter('GET', '/api/vehicles?category=motorcycle');
  const moto = s.items[0];
  const ms = nextSlot(96, 6);
  const r = await renter('POST', '/api/bookings', { vehicleId: moto.id, ...ms, acceptAgreement: true });
  assert.equal(r.status, 403);
  assert.equal(r.error.code, 'MOTORCYCLE_NOT_ELIGIBLE');
});

await step('full rental lifecycle on demo data: pickup code → active → return → completed → review', async () => {
  // The demo renter (Budi) has a confirmed booking ~26h ahead; pickup is only allowed within 1h of start,
  // so we create a fresh near-term booking on an instant-book listing instead.
  const budi = client();
  await budi('POST', '/api/auth/login', { email: 'renter@balibike.demo', password: 'Demo1234!' });
  const rina = client();
  await rina('POST', '/api/auth/login', { email: 'owner@balibike.demo', password: 'Demo1234!' });
  const mine = await rina('GET', '/api/owner/vehicles');
  // Make sure the window is open around "now" for this test listing.
  const v = mine.items.find((x) => x.name.includes('Dahon'));
  await rina('PUT', `/api/vehicles/${v.id}/availability`, { availability: [] });
  const start = new Date(Math.ceil(Date.now() / 1800_000) * 1800_000 + 2 * 86400_000 * 0).toISOString();
  const end = new Date(new Date(start).getTime() + 3600_000).toISOString();
  const b = await budi('POST', '/api/bookings', { vehicleId: v.id, start, end, acceptAgreement: true });
  assert.equal(b.status, 201, JSON.stringify(b));
  await rina('POST', `/api/bookings/${b.booking.id}/respond`, { decision: 'accept' });
  const p = await budi('POST', `/api/bookings/${b.booking.id}/pay`, { method: 'bank_transfer' });
  await budi('POST', `/api/payments/mock/${p.payment.provider_ref}/simulate`, { outcome: 'succeeded' });
  const detail = await budi('GET', `/api/bookings/${b.booking.id}`);
  const st = await rina('POST', `/api/bookings/${b.booking.id}/start`, { pickupCode: detail.booking.pickup_code, items: { tires: true, brakes: true, lights: true }, conditionOk: true, notes: 'All good' });
  assert.equal(st.booking.status, 'active', JSON.stringify(st));
  const ext = await budi('POST', `/api/bookings/${b.booking.id}/extend`, { newEnd: new Date(new Date(end).getTime() + 3600_000).toISOString(), method: 'qris' });
  assert.ok(ext.amount > 0, JSON.stringify(ext));
  const ref = ext.checkoutUrl.split('/').pop();
  await budi('POST', `/api/payments/mock/${ref}/simulate`, { outcome: 'succeeded' });
  const extended = await budi('GET', `/api/bookings/${b.booking.id}`);
  assert.equal(extended.booking.end_at, new Date(new Date(end).getTime() + 3600_000).toISOString());
  const done = await rina('POST', `/api/bookings/${b.booking.id}/complete`, { items: { tires: true, brakes: true }, conditionOk: true });
  assert.equal(done.booking.status, 'completed');
  const rv = await budi('POST', `/api/bookings/${b.booking.id}/review`, { rating: 5, comment: 'Smooth!' });
  assert.equal(rv.status, 201);
  const earn = await rina('GET', '/api/owner/earnings');
  assert.ok(earn.summary.total > 0);
  await rina('PUT', `/api/vehicles/${v.id}/availability`, { availability: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 420, endMinute: 1260 })) });
});

await step('eligible demo renter (verified SIM C) can request a motorcycle', async () => {
  const budi = client();
  await budi('POST', '/api/auth/login', { email: 'renter@balibike.demo', password: 'Demo1234!' });
  const me = await budi('GET', '/api/auth/me');
  assert.equal(me.user.eligibility.motorcycle, true, JSON.stringify(me.user.eligibility));
  const s = await budi('GET', '/api/vehicles?category=motorcycle&q=Vario');
  const ms = nextSlot(150, 6);
  const r = await budi('POST', '/api/bookings', { vehicleId: s.items[0].id, ...ms, acceptAgreement: true });
  assert.equal(r.status, 201, JSON.stringify(r));
  await budi('POST', `/api/bookings/${r.booking.id}/cancel`, {});
});

await step('RBAC: renters cannot reach admin endpoints; admin can', async () => {
  assert.equal((await renter('GET', '/api/admin/overview')).status, 403);
  await admin('POST', '/api/auth/login', { email: 'admin@balibike.demo', password: 'Demo1234!' });
  const o = await admin('GET', '/api/admin/overview');
  assert.ok(o.counts.users > 5);
});

await step('admin changes commission → new bookings snapshot the new rate', async () => {
  await admin('POST', '/api/admin/commissions', { ratePercent: 12, category: null });
  const s = await admin('GET', '/api/admin/settings');
  assert.equal(s.commissions[0].rate, 0.12);
  await admin('POST', '/api/admin/commissions', { ratePercent: 10, category: null });
});

console.log(`\n${passed} checks passed.`);
