import { q, tx } from './index.ts';
import { hashPassword } from '../auth/password.ts';
import { storage } from '../lib/storage.ts';
import { quote } from '../modules/bookings/pricing.ts';
import { bookingCode, randomDigits, log } from '../lib/util.ts';
import { vehicleIllustration } from './illustrations.ts';

/**
 * DEMONSTRATION DATA — every user, vehicle, booking and review created here is flagged is_demo = 1
 * and labelled "Demo" in the interface. None of it represents real people, vehicles, availability or payments.
 */

const PROVINCES = [
  ['DKI Jakarta', 420], ['Jawa Barat', 420], ['DI Yogyakarta', 420], ['Jawa Timur', 420],
  ['Jawa Tengah', 420], ['Bali', 480], ['Sumatera Utara', 420],
] as const;

const CITIES = [
  { name: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456, tz: 420 },
  { name: 'Bandung', province: 'Jawa Barat', lat: -6.9175, lng: 107.6191, tz: 420 },
  { name: 'Yogyakarta', province: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695, tz: 420 },
  { name: 'Surabaya', province: 'Jawa Timur', lat: -7.2575, lng: 112.7521, tz: 420 },
  { name: 'Malang', province: 'Jawa Timur', lat: -7.9666, lng: 112.6326, tz: 420 },
  { name: 'Semarang', province: 'Jawa Tengah', lat: -6.9667, lng: 110.4167, tz: 420 },
  { name: 'Denpasar', province: 'Bali', lat: -8.6705, lng: 115.2126, tz: 480 },
  { name: 'Medan', province: 'Sumatera Utara', lat: 3.5952, lng: 98.6722, tz: 420 },
];

const DISTRICTS: Record<string, [string, number, number][]> = {
  Yogyakarta: [['Depok (Sleman)', -7.7700, 110.3900], ['Gondokusuman', -7.7850, 110.3800], ['Mergangsan', -7.8100, 110.3700]],
  Bandung: [['Coblong', -6.8870, 107.6150], ['Lengkong', -6.9300, 107.6200]],
  Jakarta: [['Menteng', -6.1960, 106.8320], ['Rawamangun', -6.1940, 106.8790]],
  Surabaya: [['Sukolilo', -7.2900, 112.7900], ['Gubeng', -7.2700, 112.7500]],
};

const UNIVERSITIES = [
  { city: 'Yogyakarta', name: 'Universitas Gadjah Mada', short: 'UGM', domain: 'ugm.ac.id', lat: -7.7713, lng: 110.3775 },
  { city: 'Yogyakarta', name: 'Universitas Negeri Yogyakarta', short: 'UNY', domain: 'uny.ac.id', lat: -7.7745, lng: 110.3866 },
  { city: 'Bandung', name: 'Institut Teknologi Bandung', short: 'ITB', domain: 'itb.ac.id', lat: -6.8915, lng: 107.6107 },
  { city: 'Bandung', name: 'Universitas Padjadjaran (Dipatiukur)', short: 'UNPAD', domain: 'unpad.ac.id', lat: -6.8930, lng: 107.6170 },
  { city: 'Jakarta', name: 'Universitas Negeri Jakarta', short: 'UNJ', domain: 'unj.ac.id', lat: -6.1939, lng: 106.8784 },
  { city: 'Jakarta', name: 'Universitas Indonesia (Salemba)', short: 'UI', domain: 'ui.ac.id', lat: -6.1950, lng: 106.8485 },
  { city: 'Surabaya', name: 'Institut Teknologi Sepuluh Nopember', short: 'ITS', domain: 'its.ac.id', lat: -7.2820, lng: 112.7949 },
  { city: 'Surabaya', name: 'Universitas Airlangga', short: 'UNAIR', domain: 'unair.ac.id', lat: -7.2706, lng: 112.7584 },
  { city: 'Malang', name: 'Universitas Brawijaya', short: 'UB', domain: 'ub.ac.id', lat: -7.9525, lng: 112.6144 },
  { city: 'Semarang', name: 'Universitas Diponegoro', short: 'UNDIP', domain: 'undip.ac.id', lat: -7.0506, lng: 110.4381 },
  { city: 'Denpasar', name: 'Universitas Udayana (Sudirman)', short: 'UNUD', domain: 'unud.ac.id', lat: -8.6735, lng: 115.2210 },
  { city: 'Medan', name: 'Universitas Sumatera Utara', short: 'USU', domain: 'usu.ac.id', lat: 3.5617, lng: 98.6567 },
];

const PASSWORD = 'Demo1234!';

// Deterministic pseudo-random so demo data is stable between resets.
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const jitter = (km: number) => (rnd() - 0.5) * 2 * (km / 111);

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type VSpec = {
  owner: string; uni: string; category: 'bicycle' | 'motorcycle'; type: string; name: string; brand: string; model: string; year: number;
  condition: string; deposit: number; prices: [number, number][]; desc: string; hours?: [number, number]; instant?: boolean; color: string;
};

const BIKE_RULES = 'Return the bicycle clean and locked. Helmet included. No riding on toll roads or highways.';
const MOTO_RULES = 'Valid SIM C and original KTP required at pickup. Helmet (SNI) provided. Return with the same fuel level. No passengers under 12.';

const VEHICLES: VSpec[] = [
  { owner: 'rina', uni: 'UGM', category: 'bicycle', type: 'city', name: 'Polygon Sierra — campus cruiser', brand: 'Polygon', model: 'Sierra Lite', year: 2023, condition: 'excellent', deposit: 50000,
    prices: [[30, 5000], [60, 8000], [180, 20000], [360, 35000], [1440, 60000]], desc: 'Comfortable city bike with front basket, perfect for getting between faculties at UGM. Lock and helmet included.', hours: [6, 22], instant: true, color: '#2563eb' },
  { owner: 'rina', uni: 'UGM', category: 'bicycle', type: 'folding', name: 'Dahon folding bike', brand: 'Dahon', model: 'Mariner D8', year: 2022, condition: 'good', deposit: 100000,
    prices: [[60, 10000], [180, 25000], [1440, 75000]], desc: 'Folds in 15 seconds — take it on Trans Jogja or keep it under your desk.', hours: [7, 21], color: '#0f766e' },
  { owner: 'dimas', uni: 'UGM', category: 'bicycle', type: 'mountain', name: 'United Detroit MTB', brand: 'United', model: 'Detroit 1.0', year: 2021, condition: 'good', deposit: 75000,
    prices: [[60, 10000], [360, 40000], [1440, 70000]], desc: 'Hardtail mountain bike, great for weekend rides to Kaliurang. Recently serviced.', color: '#b45309' },
  { owner: 'dimas', uni: 'UNY', category: 'bicycle', type: 'student', name: 'Pacific student bike', brand: 'Pacific', model: 'Exotic 2.0', year: 2020, condition: 'fair', deposit: 0,
    prices: [[30, 4000], [60, 6000], [1440, 40000]], desc: 'Simple, reliable, affordable. Ideal for short trips around UNY.', hours: [6, 20], instant: true, color: '#7c3aed' },
  { owner: 'rina', uni: 'UNY', category: 'bicycle', type: 'electric_bicycle', name: 'Selis e-bike Elvio', brand: 'Selis', model: 'Elvio', year: 2024, condition: 'new', deposit: 200000,
    prices: [[60, 15000], [180, 40000], [720, 80000], [1440, 120000]], desc: 'Pedal-assist electric bicycle, ~40 km range. Charger available on request for multi-day rentals.', hours: [7, 21], color: '#059669' },
  { owner: 'dimas', uni: 'UGM', category: 'motorcycle', type: 'automatic', name: 'Honda BeAT — daily commuter', brand: 'Honda', model: 'BeAT CBS', year: 2022, condition: 'excellent', deposit: 300000,
    prices: [[360, 45000], [720, 65000], [1440, 85000]], desc: 'Fuel-efficient automatic scooter. STNK verified. Two SNI helmets and a raincoat included.', hours: [7, 21], color: '#dc2626' },
  { owner: 'rina', uni: 'UGM', category: 'motorcycle', type: 'scooter', name: 'Yamaha NMAX 155', brand: 'Yamaha', model: 'NMAX 155', year: 2023, condition: 'excellent', deposit: 500000,
    prices: [[360, 70000], [720, 100000], [1440, 140000]], desc: 'Comfortable maxi-scooter for longer trips — Parangtritis or Borobudur in comfort.', hours: [7, 20], color: '#1e293b' },
  { owner: 'ayu', uni: 'ITB', category: 'bicycle', type: 'road', name: 'Element road bike', brand: 'Element', model: 'FRC 39', year: 2023, condition: 'excellent', deposit: 150000,
    prices: [[60, 15000], [180, 35000], [1440, 90000]], desc: 'Lightweight aluminium road bike for Dago climbs. Sizes fit riders 165–180 cm.', hours: [5, 20], color: '#0891b2' },
  { owner: 'ayu', uni: 'ITB', category: 'bicycle', type: 'city', name: 'Polygon Zenith city bike', brand: 'Polygon', model: 'Zenith 2', year: 2022, condition: 'good', deposit: 50000,
    prices: [[30, 5000], [60, 8000], [360, 30000], [1440, 55000]], desc: 'Upright city bike near Ganesha campus. Basket and rear rack.', instant: true, color: '#4f46e5' },
  { owner: 'ayu', uni: 'UNPAD', category: 'bicycle', type: 'folding', name: 'Brompton C Line', brand: 'Brompton', model: 'C Line Explore', year: 2021, condition: 'excellent', deposit: 500000,
    prices: [[60, 25000], [360, 90000], [1440, 150000]], desc: 'The iconic folding bike. ID check at pickup. Treat her kindly!', hours: [8, 20], color: '#be123c' },
  { owner: 'ayu', uni: 'ITB', category: 'motorcycle', type: 'automatic', name: 'Honda Vario 125', brand: 'Honda', model: 'Vario 125', year: 2021, condition: 'good', deposit: 300000,
    prices: [[360, 50000], [1440, 90000]], desc: 'Reliable automatic for Bandung traffic. STNK and tax up to date.', hours: [7, 21], color: '#334155' },
  { owner: 'putu', uni: 'UNUD', category: 'bicycle', type: 'city', name: 'Beach cruiser Sanur', brand: 'Pacific', model: 'Cruiser 26', year: 2022, condition: 'good', deposit: 50000,
    prices: [[60, 10000], [360, 40000], [1440, 70000]], desc: 'Relaxed cruiser bike, great for the Sanur beach path.', color: '#ea580c' },
  { owner: 'putu', uni: 'UNUD', category: 'motorcycle', type: 'scooter', name: 'Honda Scoopy', brand: 'Honda', model: 'Scoopy Prestige', year: 2023, condition: 'excellent', deposit: 400000,
    prices: [[360, 60000], [1440, 100000]], desc: 'Stylish scooter for getting around Denpasar. International licence holders: SIM C equivalent required.', hours: [8, 20], color: '#db2777' },
  { owner: 'putu', uni: 'UNUD', category: 'motorcycle', type: 'electric_motorcycle', name: 'Gesits electric', brand: 'Gesits', model: 'G1', year: 2023, condition: 'excellent', deposit: 400000,
    prices: [[360, 55000], [1440, 95000]], desc: 'Indonesian-made electric motorcycle. ~50 km range, swap battery at partner stations.', hours: [8, 20], color: '#16a34a' },
  { owner: 'fajar', uni: 'ITS', category: 'bicycle', type: 'mountain', name: 'Polygon Xtrada 5', brand: 'Polygon', model: 'Xtrada 5', year: 2022, condition: 'good', deposit: 100000,
    prices: [[60, 12000], [360, 45000], [1440, 75000]], desc: 'Hydraulic disc brakes, 2x10 speed. Near ITS Sukolilo campus.', hours: [6, 21], color: '#ca8a04' },
  { owner: 'fajar', uni: 'UNAIR', category: 'bicycle', type: 'student', name: 'United student bike', brand: 'United', model: 'Bimax', year: 2021, condition: 'fair', deposit: 0,
    prices: [[30, 4000], [60, 7000], [1440, 40000]], desc: 'No-frills student bike near UNAIR Campus B.', instant: true, color: '#9333ea' },
  { owner: 'fajar', uni: 'ITS', category: 'motorcycle', type: 'manual', name: 'Yamaha Vixion', brand: 'Yamaha', model: 'Vixion R', year: 2020, condition: 'good', deposit: 500000,
    prices: [[720, 90000], [1440, 120000]], desc: 'Manual sport bike. Experienced riders only — manual clutch.', hours: [7, 20], color: '#1d4ed8' },
  { owner: 'sinta', uni: 'UB', category: 'bicycle', type: 'electric_bicycle', name: 'Uwinfly e-bike', brand: 'Uwinfly', model: 'Wingman', year: 2024, condition: 'new', deposit: 200000,
    prices: [[60, 15000], [360, 55000], [1440, 100000]], desc: 'E-bike for Malang\'s hills — climbs to Batu are easy.', hours: [7, 21], color: '#0d9488' },
  { owner: 'sinta', uni: 'UB', category: 'bicycle', type: 'city', name: 'Genio city bike', brand: 'Genio', model: 'Urban 26', year: 2022, condition: 'good', deposit: 50000,
    prices: [[30, 5000], [60, 8000], [1440, 50000]], desc: 'City bike near Brawijaya. Bell, lights and lock included.', instant: true, color: '#2563eb' },
  { owner: 'sinta', uni: 'UNDIP', category: 'bicycle', type: 'road', name: 'Pacific Aviator road bike', brand: 'Pacific', model: 'Aviator', year: 2021, condition: 'good', deposit: 100000,
    prices: [[60, 12000], [360, 45000], [1440, 80000]], desc: 'Road bike for Tembalang commutes.', color: '#475569' },
  { owner: 'bayu', uni: 'UNJ', category: 'bicycle', type: 'folding', name: 'Element Police folding bike', brand: 'Element', model: 'Police Tokyo', year: 2023, condition: 'excellent', deposit: 100000,
    prices: [[60, 12000], [180, 30000], [1440, 80000]], desc: 'Folding bike that fits KRL commuter trains. Near UNJ Rawamangun.', hours: [6, 22], instant: true, color: '#0369a1' },
  { owner: 'bayu', uni: 'UI', category: 'bicycle', type: 'city', name: 'Polygon Sierra AX', brand: 'Polygon', model: 'Sierra AX', year: 2022, condition: 'good', deposit: 50000,
    prices: [[30, 6000], [60, 10000], [360, 40000], [1440, 65000]], desc: 'City bike close to UI Salemba — handy for Menteng and Cikini.', color: '#7c2d12' },
  { owner: 'bayu', uni: 'UNJ', category: 'motorcycle', type: 'automatic', name: 'Honda Genio', brand: 'Honda', model: 'Genio CBS', year: 2022, condition: 'excellent', deposit: 300000,
    prices: [[360, 55000], [1440, 95000]], desc: 'Compact automatic for Jakarta traffic. E-toll card not included.', hours: [7, 21], color: '#991b1b' },
  { owner: 'lestari', uni: 'USU', category: 'bicycle', type: 'mountain', name: 'Thrill Ravage MTB', brand: 'Thrill', model: 'Ravage 3.0', year: 2022, condition: 'good', deposit: 100000,
    prices: [[60, 10000], [360, 40000], [1440, 70000]], desc: 'Mountain bike near USU Padang Bulan.', hours: [6, 20], color: '#15803d' },
];

const PEOPLE: Record<string, { name: string; email: string; city: string; uni?: string; role: 'owner' | 'renter' | 'admin'; dob: string; verified: boolean }> = {
  admin: { name: 'VELOX Admin (Demo)', email: 'admin@velox.demo', city: 'Jakarta', role: 'admin', dob: '1990-01-01', verified: true },
  rina: { name: 'Rina Wulandari', email: 'owner@velox.demo', city: 'Yogyakarta', uni: 'UGM', role: 'owner', dob: '2001-04-12', verified: true },
  dimas: { name: 'Dimas Pratama', email: 'dimas@velox.demo', city: 'Yogyakarta', uni: 'UNY', role: 'owner', dob: '2000-09-03', verified: true },
  ayu: { name: 'Ayu Lestari', email: 'ayu@velox.demo', city: 'Bandung', uni: 'ITB', role: 'owner', dob: '1999-11-21', verified: true },
  putu: { name: 'Putu Wirawan', email: 'putu@velox.demo', city: 'Denpasar', uni: 'UNUD', role: 'owner', dob: '1998-02-14', verified: true },
  fajar: { name: 'Fajar Nugroho', email: 'fajar@velox.demo', city: 'Surabaya', uni: 'ITS', role: 'owner', dob: '2000-06-30', verified: false },
  sinta: { name: 'Sinta Maharani', email: 'sinta@velox.demo', city: 'Malang', uni: 'UB', role: 'owner', dob: '2001-08-08', verified: true },
  bayu: { name: 'Bayu Saputra', email: 'bayu@velox.demo', city: 'Jakarta', uni: 'UNJ', role: 'owner', dob: '1997-12-01', verified: true },
  lestari: { name: 'Lestari Siregar', email: 'lestari@velox.demo', city: 'Medan', uni: 'USU', role: 'owner', dob: '2000-03-17', verified: false },
  budi: { name: 'Budi Santoso', email: 'renter@velox.demo', city: 'Yogyakarta', uni: 'UGM', role: 'renter', dob: '2003-05-20', verified: true },
  sari: { name: 'Sari Indah', email: 'sari@velox.demo', city: 'Yogyakarta', uni: 'UGM', role: 'renter', dob: '2005-10-02', verified: false },
  reza: { name: 'Reza Hidayat', email: 'reza@velox.demo', city: 'Bandung', uni: 'ITB', role: 'renter', dob: '2002-07-11', verified: true },
};

const REVIEW_TEXTS = [
  'Bike was clean and exactly as described. Pickup was quick.',
  'Very friendly owner, flexible with pickup time. Recommended!',
  'Sepedanya enak dipakai, pemiliknya ramah. Mantap!',
  'Good condition, brakes worked well. Would rent again.',
  'Handover with the digital checklist took two minutes. Great experience.',
  'Pas buat ke kampus, harga terjangkau.',
];

export function seedDemo() {
  const started = Date.now();
  tx(() => {
    // Commission & settings
    q.run(`INSERT INTO platform_commissions (rate, category, effective_from) VALUES (0.10, NULL, '2026-01-01T00:00:00.000Z')`);

    // Locations
    const country = q.run(`INSERT INTO locations (type, name, slug, lat, lng) VALUES ('country', 'Indonesia', 'indonesia', -2.5, 118)`).id;
    const provIds: Record<string, number> = {};
    for (const [name, tz] of PROVINCES) provIds[name] = q.run(`INSERT INTO locations (parent_id, type, name, slug, utc_offset_minutes) VALUES (?, 'province', ?, ?, ?)`,
      [country, name, 'prov-' + slugify(name), tz]).id;
    const cityIds: Record<string, number> = {};
    for (const c of CITIES) {
      cityIds[c.name] = q.run(`INSERT INTO locations (parent_id, type, name, slug, lat, lng, utc_offset_minutes) VALUES (?, 'city', ?, ?, ?, ?, ?)`,
        [provIds[c.province], c.name, slugify(c.name), c.lat, c.lng, c.tz]).id;
      for (const [d, lat, lng] of DISTRICTS[c.name] ?? [])
        q.run(`INSERT INTO locations (parent_id, type, name, slug, lat, lng, utc_offset_minutes) VALUES (?, 'district', ?, ?, ?, ?, ?)`,
          [cityIds[c.name], d, slugify(c.name + '-' + d), lat, lng, c.tz]);
    }
    const uniIds: Record<string, { id: number; lat: number; lng: number; city: string }> = {};
    for (const u of UNIVERSITIES) uniIds[u.short] = { id: q.run(`INSERT INTO universities (city_id, name, short_name, slug, email_domain, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cityIds[u.city], u.name, u.short, slugify(u.short), u.domain, u.lat, u.lng]).id, lat: u.lat, lng: u.lng, city: u.city };

    // Users (one shared hash keeps seeding fast; each account has the same demo password)
    const hash = hashPassword(PASSWORD);
    const userIds: Record<string, number> = {};
    const verifiedAt = '2026-09-01T08:00:00.000Z';
    for (const [key, p] of Object.entries(PEOPLE)) {
      const phone = '+62812' + String(10000000 + Object.keys(userIds).length * 7919).slice(0, 8);
      const id = q.run(`INSERT INTO users (email, phone, password_hash, role, email_verified_at, phone_verified_at, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [p.email, phone, hash, p.role, verifiedAt, p.verified ? verifiedAt : null, '2026-08-15T08:00:00.000Z']).id;
      userIds[key] = id;
      q.run(`INSERT INTO user_profiles (user_id, full_name, date_of_birth, city_id, university_id, university_verified, locale, bio) VALUES (?, ?, ?, ?, ?, ?, 'en', ?)`,
        [id, p.name, p.dob, cityIds[p.city], p.uni ? uniIds[p.uni].id : null, p.verified && p.uni ? 1 : 0,
          p.role === 'owner' ? 'Demo owner profile. Student and bike enthusiast.' : null]);
      if (p.verified) {
        q.run(`INSERT INTO user_verifications (user_id, type, status, document_number, reviewed_at) VALUES (?, 'identity', 'approved', '••••1234', ?)`, [id, verifiedAt]);
      }
    }
    // Budi (demo renter) holds an approved SIM C → eligible for motorcycles. Sari is 21 but has no licence on file.
    q.run(`INSERT INTO user_verifications (user_id, type, status, document_number, license_class, expires_on, reviewed_at)
           VALUES (?, 'driving_license', 'approved', '••••5678', 'C', '2030-05-20', ?)`, [userIds.budi, verifiedAt]);
    q.run(`INSERT INTO user_verifications (user_id, type, status, document_number, license_class, expires_on, reviewed_at)
           VALUES (?, 'driving_license', 'approved', '••••9012', 'C', '2029-07-11', ?)`, [userIds.reza, verifiedAt]);
    // Pending items so the admin verification queue has something to review.
    q.run(`INSERT INTO user_verifications (user_id, type, status, document_number) VALUES (?, 'identity', 'pending', '••••3344')`, [userIds.fajar]);
    q.run(`INSERT INTO user_verifications (user_id, type, status, document_number) VALUES (?, 'identity', 'pending', '••••7788')`, [userIds.sari]);

    // Vehicles
    const vehicleIds: number[] = [];
    VEHICLES.forEach((v, idx) => {
      const uni = uniIds[v.uni];
      const lat = uni.lat + jitter(1.6), lng = uni.lng + jitter(1.6);
      const isMoto = v.category === 'motorcycle';
      const created = new Date(Date.UTC(2026, 8, 1) + idx * 2.3 * 86400_000).toISOString();
      const id = q.run(`INSERT INTO vehicles (owner_id, category, type, name, brand, model, year, description, condition, rules, deposit, city_id, university_id,
          pickup_address, lat, lng, plate_number, registration_status, status, instant_book, is_demo, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?, 1, ?)`,
        [userIds[v.owner], v.category, v.type, v.name, v.brand, v.model, v.year, v.desc, v.condition, isMoto ? MOTO_RULES : BIKE_RULES, v.deposit,
          cityIds[uni.city], uni.id, `Near ${UNIVERSITIES.find((u) => u.short === v.uni)!.name} (demo pickup point)`, lat, lng,
          isMoto ? `AB ${1000 + idx * 37} ${pick(['XY', 'KL', 'RT', 'MN'])}` : null, isMoto ? 'approved' : 'not_required', v.instant ? 1 : 0, created]).id;
      vehicleIds.push(id);
      for (const [d, p] of v.prices) q.run('INSERT INTO vehicle_pricing (vehicle_id, duration_minutes, price) VALUES (?, ?, ?)', [id, d, p]);
      if (v.hours) for (let wd = 0; wd < 7; wd++)
        q.run(`INSERT INTO vehicle_availability (vehicle_id, kind, weekday, start_minute, end_minute) VALUES (?, 'weekly', ?, ?, ?)`, [id, wd, v.hours[0] * 60, v.hours[1] * 60]);
      for (let i = 0; i < 3; i++) {
        const key = storage.put('public', Buffer.from(vehicleIllustration(v.category, v.type, v.color, i)), 'svg');
        q.run('INSERT INTO vehicle_images (vehicle_id, url, position) VALUES (?, ?, ?)', [id, '/uploads/' + key, i]);
      }
    });

    // Bookings: past completed (with ledger + reviews), one active, one confirmed, one pending request.
    const renters = ['budi', 'reza', 'sari'];
    const mk = (vIdx: number, renterKey: string, startOffsetH: number, hours: number, status: string) => {
      const spec = VEHICLES[vIdx];
      const vehicleId = vehicleIds[vIdx];
      const ownerId = userIds[spec.owner];
      const renterId = userIds[renterKey];
      const start = new Date(Math.round((Date.now() + startOffsetH * 3600_000) / 1800_000) * 1800_000);
      const end = new Date(start.getTime() + hours * 3600_000);
      const qt = quote(spec.prices.map(([d, p]) => ({ duration_minutes: d, price: p })), hours * 60)!;
      const code = bookingCode();
      const commission = Math.round(qt.subtotal * 0.1);
      const id = q.run(`INSERT INTO bookings (code, vehicle_id, renter_id, owner_id, start_at, end_at, status, subtotal, deposit, total, commission_rate,
          price_breakdown, pickup_code, picked_up_at, returned_at, is_demo, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,0.1,?,?,?,?,1,?,?)`,
        [code, vehicleId, renterId, ownerId, start.toISOString(), end.toISOString(), status, qt.subtotal, spec.deposit, qt.subtotal + spec.deposit,
          JSON.stringify(qt), randomDigits(6), ['active', 'completed'].includes(status) ? start.toISOString() : null,
          status === 'completed' ? end.toISOString() : null, new Date(start.getTime() - 86400_000).toISOString(),
          status === 'pending' ? new Date(Date.now() + 2 * 3600_000).toISOString() : null]).id;
      q.run('INSERT INTO booking_status_history (booking_id, from_status, to_status, note) VALUES (?, NULL, ?, ?)', [id, status, 'demo_seed']);
      q.run(`INSERT INTO rental_agreements (booking_id, version, content_hash, renter_accepted_at, owner_accepted_at) VALUES (?, '2026-11-v1', 'demo', ?, ?)`,
        [id, start.toISOString(), status === 'pending' ? null : start.toISOString()]);
      const conv = q.get<any>('SELECT id FROM conversations WHERE vehicle_id = ? AND renter_id = ?', [vehicleId, renterId]);
      if (!conv) q.run('INSERT INTO conversations (vehicle_id, renter_id, owner_id, booking_id) VALUES (?, ?, ?, ?)', [vehicleId, renterId, ownerId, id]);
      if (['confirmed', 'active', 'completed'].includes(status)) {
        const pid = q.run(`INSERT INTO payments (booking_id, purpose, provider, provider_ref, method, amount, status, is_test, confirmed_at) VALUES (?, 'booking', 'mock', ?, ?, ?, 'succeeded', 1, ?)`,
          [id, `MOCK-${code}-seed`, pick(['qris', 'ewallet', 'bank_transfer']), qt.subtotal + spec.deposit, start.toISOString()]).id;
        const t = (uid: number | null, type: string, amt: number) => amt > 0 && q.run('INSERT INTO transactions (booking_id, payment_id, user_id, type, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, pid, uid, type, amt, start.toISOString()]);
        t(renterId, 'renter_charge', qt.subtotal); t(renterId, 'deposit_hold', spec.deposit);
        t(null, 'platform_commission', commission); t(ownerId, 'owner_earning', qt.subtotal - commission);
        if (status === 'completed') t(renterId, 'deposit_release', spec.deposit);
        q.run(`INSERT INTO owner_earnings (owner_id, booking_id, gross, commission, net, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [ownerId, id, qt.subtotal, commission, qt.subtotal - commission, status === 'completed' ? 'available' : 'pending', start.toISOString()]);
      }
      if (status === 'completed') {
        const rating = rnd() > 0.25 ? 5 : 4;
        q.run(`INSERT INTO reviews (booking_id, author_id, subject_user_id, vehicle_id, direction, rating, comment, is_demo, created_at) VALUES (?, ?, ?, ?, 'renter_to_owner', ?, ?, 1, ?)`,
          [id, renterId, ownerId, vehicleId, rating, pick(REVIEW_TEXTS), end.toISOString()]);
        q.run(`INSERT INTO reviews (booking_id, author_id, subject_user_id, vehicle_id, direction, rating, comment, is_demo, created_at) VALUES (?, ?, ?, NULL, 'owner_to_renter', 5, 'Great renter, returned on time.', 1, ?)`,
          [id, ownerId, renterId, end.toISOString()]);
      }
      return id;
    };
    // Completed history spread across the last two months
    let n = 0;
    for (let i = 0; i < VEHICLES.length; i++) {
      const times = VEHICLES[i].category === 'bicycle' ? 2 : 1;
      for (let k = 0; k < times; k++) {
        const renter = VEHICLES[i].category === 'motorcycle' ? pick(['budi', 'reza']) : pick(renters);
        mk(i, renter, -24 * (5 + ((n * 7) % 55)) - k * 30, pick([1, 3, 6, 24]), 'completed');
        n++;
      }
    }
    mk(0, 'reza', -1, 3, 'active');      // Rina's Polygon: currently rented
    mk(1, 'budi', 26, 3, 'confirmed');   // Budi has an upcoming paid booking
    mk(4, 'sari', 30, 6, 'pending');     // Rina has a request waiting for her decision

    // Ratings cache
    q.run(`UPDATE vehicles SET rating_avg = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews r WHERE r.vehicle_id = vehicles.id), 0),
           rating_count = (SELECT COUNT(*) FROM reviews r WHERE r.vehicle_id = vehicles.id)`);

    // A sample report & message thread
    q.run(`INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?, 'vehicle', ?, 'inaccurate', 'Demo report: photos look different from the actual bike.')`,
      [userIds.sari, vehicleIds[15]]);
    const conv = q.get<any>('SELECT id FROM conversations WHERE vehicle_id = ? AND renter_id = ?', [vehicleIds[1], userIds.budi]);
    if (conv) {
      q.run('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)', [conv.id, userIds.budi, 'Hi Rina! Can I pick up at the Faculty of Engineering gate?', new Date(Date.now() - 3 * 3600_000).toISOString()]);
      q.run('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)', [conv.id, userIds.rina, 'Sure, see you there. Show me your VELOX pickup code 🙂', new Date(Date.now() - 2.5 * 3600_000).toISOString()]);
      q.run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [new Date(Date.now() - 2.5 * 3600_000).toISOString(), conv.id]);
    }
  });
  log.info('demo data seeded', { ms: Date.now() - started, password: PASSWORD });
}
