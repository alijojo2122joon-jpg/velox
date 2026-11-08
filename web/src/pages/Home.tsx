import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Link, navigate } from '../lib/router';
import { useApi } from '../lib/hooks';
import { qs } from '../lib/api';
import { useFormat } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/icons';
import { Button, ButtonLink, Select, cx, DemoBadge } from '../components/ui';
import { VehicleCard, VehicleCardSkeleton, type VehicleSummary } from '../components/VehicleCard';
import { Aurora, CountUp, useCycle } from '../lib/motion';
import { AREA_PHOTOS } from '../photos';

const BIKE_TYPES = ['city', 'mountain', 'road', 'folding', 'electric_bicycle', 'student'];
const MOTO_TYPES = ['scooter', 'automatic', 'manual', 'electric_motorcycle'];

/* Soft gradient shown under each area photo (and instead of it while it loads). */
const AREA_TINT: Record<string, string> = {
  ubud: 'linear-gradient(160deg,#1e3a8a,#0ea5e9)', canggu: 'linear-gradient(160deg,#0c4a6e,#22d3ee)', uluwatu: 'linear-gradient(160deg,#1e40af,#38bdf8)',
  seminyak: 'linear-gradient(160deg,#312e81,#60a5fa)', kuta: 'linear-gradient(160deg,#075985,#7dd3fc)', sanur: 'linear-gradient(160deg,#1d4ed8,#a5f3fc)',
  denpasar: 'linear-gradient(160deg,#172554,#3b82f6)', 'nusa-dua': 'linear-gradient(160deg,#0f766e,#67e8f9)',
};

function HeroSearch() {
  const t = useT();
  const { data: cities } = useApi<{ items: any[] }>('/api/locations/cities');
  const [category, setCategory] = useState<'bicycle' | 'motorcycle'>('bicycle');
  const [cityId, setCityId] = useState('');
  const [locating, setLocating] = useState(false);

  // '' = all of Bali (default market), 'all' = every city in Indonesia, otherwise a specific area/city.
  const go = (extra: Record<string, unknown> = {}) => navigate('/search' + qs({ category,
    cityId: cityId && cityId !== 'all' ? cityId : undefined, region: cityId === '' ? 'bali' : undefined, ...extra }));
  const nearMe = () => {
    if (!navigator.geolocation) return go();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); go({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5), radiusKm: 2, sort: 'nearest', cityId: undefined, region: undefined }); },
      () => { setLocating(false); go(); }, { timeout: 8000 });
  };

  return (
    <div className="glass glow-border rounded-3xl p-2">
      {/* Segmented control with a sliding pill */}
      <div className="relative m-1 grid w-full max-w-xs grid-cols-2 rounded-2xl bg-ink-100/70 p-1">
        <span aria-hidden="true" className={cx('absolute inset-y-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-[0_4px_12px_-4px_rgb(15_40_90/0.25)] transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]',
          category === 'bicycle' ? 'start-1' : 'start-[calc(50%+2px)]')} />
        {(['bicycle', 'motorcycle'] as const).map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={cx('relative z-10 flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors duration-300', category === c ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800')}>
            <Icon name={c === 'bicycle' ? 'bike' : 'moto'} size={18} />{t(`categories.${c}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-1 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="pin" size={18} className="pointer-events-none absolute start-3.5 top-1/2 z-10 -translate-y-1/2 text-brand-500" />
          <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className="h-13 border-transparent bg-white/80 ps-10 text-base" aria-label={t('search.city')}>
            <CityOptions cities={cities?.items ?? []} />
          </Select>
        </div>
        <Button variant="secondary" size="lg" icon="locate" loading={locating} onClick={nearMe} className="h-13">{t('home.nearMe')}</Button>
        <Button variant="brand" size="lg" icon="search" onClick={() => go()} className="h-13 px-7">{t('home.search')}</Button>
      </div>
      <div className={cx('grid transition-all duration-500', category === 'motorcycle' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <p className="flex items-center gap-1.5 overflow-hidden px-3 text-xs text-ink-500"><Icon name="shield" size={14} className="text-brand-500" /><span className="pb-2 pt-1">{t('home.motoNote')}</span></p>
      </div>
    </div>
  );
}

export function Home() {
  const t = useT();
  const { money, num } = useFormat();
  const { user } = useAuth();
  const { data: featured, loading } = useApi<{ items: VehicleSummary[] }>('/api/vehicles?sort=rating&category=bicycle&region=bali');
  const { data: stats } = useApi<any>('/api/stats');
  const { data: unis } = useApi<{ items: any[] }>('/api/universities');
  const { data: cityList } = useApi<{ items: any[] }>('/api/locations/cities');
  const baliAreas = (cityList?.items ?? []).filter((c) => c.province_slug === 'prov-bali');
  const hero = featured?.items[0];
  const listHref = user && user.role !== 'renter' ? '/dashboard/owner/vehicles/new' : user ? '/account?become=owner' : '/register?role=owner';

  return (
    <div className="overflow-x-clip">
      {/* ───── Hero ───── */}
      <section className="relative -mt-16 pt-16">
        <Aurora />
        <div className="grid-bg" />
        <div className="container-x relative grid items-center gap-14 pb-20 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-24">
          <div>
            <span className="animate-fade-up inline-flex items-center gap-2.5 rounded-full border border-brand-100 bg-white/80 py-1.5 pe-4 ps-1.5 text-xs font-bold text-ink-700 shadow-sm backdrop-blur">
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">Bali</span>
              {t('home.badge')}
            </span>
            <h1 className="font-display mt-7 text-[2.7rem] font-extrabold leading-[1.04] tracking-tight text-ink-950 sm:text-6xl lg:text-[4.1rem]">
              <span className="block">{t('home.title1')}</span>
              <span className="text-gradient block pb-1">{t('home.title2')}</span>
            </h1>
            <p data-reveal className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">{t('home.subtitle')}</p>
            <div data-reveal className="mt-9 max-w-2xl"><HeroSearch /></div>
            <div data-reveal className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-ink-700">
              {['verified', 'checklist', 'payments'].map((k) => (
                <span key={k} className="inline-flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white"><Icon name="check" size={12} strokeWidth={3} /></span>
                  {t(`home.trustline.${k}`)}
                </span>
              ))}
            </div>
          </div>

          {/* Product preview composed from a real (demo) listing; each layer floats on its own rhythm */}
          <div data-reveal className="relative mx-auto hidden w-full max-w-md lg:block">
            <svg aria-hidden="true" viewBox="0 0 400 400" className="pointer-events-none absolute -inset-16 h-[calc(100%+8rem)] w-[calc(100%+8rem)] animate-[spin-slow_60s_linear_infinite] opacity-70">
              <circle cx="200" cy="200" r="196" fill="none" stroke="url(#ring)" strokeWidth="1.2" strokeDasharray="2 10" strokeLinecap="round" />
              <circle cx="200" cy="200" r="160" fill="none" stroke="#bdd7ff" strokeWidth="1" />
              <circle cx="200" cy="4" r="5" fill="#2f76ff" /><circle cx="360" cy="200" r="4" fill="#22d3ee" />
              <defs><linearGradient id="ring" x1="0" x2="1"><stop offset="0" stopColor="#2f76ff" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
            </svg>
            {hero ? (
              <div className="relative">
                <div className="float-a" data-noreveal><VehicleCard v={hero} /></div>
                <div className="glass float-b absolute -start-14 bottom-20 w-56 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-600"><span className="ping-dot h-2 w-2 rounded-full bg-teal-500" />{t('home.preview.booked')}</div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">{t('home.preview.pickup')}</div>
                  <div className="mt-2.5 flex gap-1" dir="ltr">{'482915'.split('').map((d, i) => (
                    <span key={i} className="flex h-8 w-7 animate-fade-up items-center justify-center rounded-lg bg-brand-50 font-mono text-sm font-bold text-brand-700" style={{ animationDelay: `${800 + i * 90}ms` }}>{d}</span>))}</div>
                </div>
                <div className="glass float-c absolute -end-10 -top-8 rounded-2xl px-4 py-3">
                  <div className="text-[11px] font-semibold text-ink-500">{t('home.preview.earned')}</div>
                  <div className="text-lg font-extrabold text-ink-950">{money(1240000)}</div>
                  <div className="mt-1.5 flex h-6 items-end gap-1" aria-hidden="true">
                    {[40, 65, 50, 80, 60, 95, 75].map((h, i) => <span key={i} className="bar-anim w-2 rounded-sm bg-gradient-to-t from-brand-500 to-cyan-400" style={{ height: `${h}%`, animationDelay: `${i * 0.18}s` }} />)}
                  </div>
                  <DemoBadge className="mt-1.5" />
                </div>
              </div>
            ) : <VehicleCardSkeleton />}
          </div>
        </div>

        {/* Live numbers */}
        {stats && (
          <div className="container-x relative pb-6">
            <div data-reveal className="glass grid grid-cols-2 rounded-3xl md:grid-cols-4">
              {[['vehicles', stats.vehicles, 'bike'], ['cities', stats.bali_areas ?? stats.cities, 'pin'], ['universities', stats.universities, 'graduation'], ['rentals', stats.completed, 'check']].map(([k, v, ic], i) => (
                <div key={k as string} className={cx('flex items-center gap-4 px-5 py-6 sm:px-8', i % 2 === 1 && 'border-s border-ink-200/70', i >= 2 && 'border-t border-ink-200/70 md:border-t-0', i === 2 && 'md:border-s')}>
                  <span className="neu-icon hidden h-11 w-11 shrink-0 sm:inline-flex"><Icon name={ic as string} size={20} /></span>
                  <div className="min-w-0">
                    <CountUp value={v as number} className="font-display block text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl" />
                    <div className="mt-0.5 truncate text-sm font-medium text-ink-500">{t(`home.stats.${k}`)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center text-xs text-ink-400">{t('home.stats.note')}</div>
          </div>
        )}
      </section>

      {/* ───── Explore Bali: gliding area cards ───── */}
      {baliAreas.length > 0 && (
        <section className="pt-24">
          <div className="container-x"><SectionTitle eyebrow={t('home.areas.eyebrow')} title={t('home.areas.title')} /></div>
          <div className="marquee" style={{ ['--dur' as any]: '55s' }}>
            <div className="marquee-track gap-5 py-4">
              {[...baliAreas, ...baliAreas].map((a, i) => {
                const dup = i >= baliAreas.length;
                return (
                  <Link key={`${a.id}-${i}`} to={`/search?cityId=${a.id}`} aria-hidden={dup || undefined} tabIndex={dup ? -1 : undefined}
                    className="group relative block h-72 w-60 shrink-0 overflow-hidden rounded-3xl shadow-[0_20px_40px_-20px_rgb(15_40_90/0.5)] transition duration-500 hover:-translate-y-2 sm:w-64"
                    style={{ background: AREA_TINT[a.slug] ?? AREA_TINT.denpasar }}>
                    {AREA_PHOTOS[a.slug] && <img src={AREA_PHOTOS[a.slug].src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-[1.2s] ease-out group-hover:scale-110" />}
                    <span className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/20 to-transparent" />
                    <span className="absolute end-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-ink-900 backdrop-blur">
                      <Icon name="bike" size={13} />{num(a.vehicle_count)}</span>
                    <span className="absolute inset-x-5 bottom-5 text-white">
                      <span className="font-display block text-2xl font-extrabold">{a.name}</span>
                      <span className="mt-1 block text-[13px] leading-snug text-white/80">{t(`home.areas.tips.${a.slug}`)}</span>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-cyan-200 opacity-0 transition duration-500 group-hover:opacity-100">
                        {t('home.areas.vehicles', { n: num(a.vehicle_count) })}<Icon name="arrowRight" size={14} /></span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───── Categories ───── */}
      <section className="container-x pt-24">
        <SectionTitle eyebrow={t('home.categories.eyebrow')} title={t('home.categories.title')} />
        <div className="grid gap-5 md:grid-cols-2">
          {([['bicycle', BIKE_TYPES], ['motorcycle', MOTO_TYPES]] as const).map(([cat, types]) => (
            <div key={cat} className="card spotlight group relative overflow-hidden p-7 sm:p-9">
              <Icon name={cat === 'bicycle' ? 'bike' : 'moto'} size={220} strokeWidth={0.6} aria-hidden="true"
                className="pointer-events-none absolute -bottom-10 -end-8 text-brand-100 transition duration-700 group-hover:-translate-y-2 group-hover:text-brand-200 rtl:-scale-x-100" />
              <div className="relative flex items-start justify-between gap-4">
                <span className="neu-icon h-14 w-14"><Icon name={cat === 'bicycle' ? 'bike' : 'moto'} size={26} /></span>
                <ButtonLink to={`/search?category=${cat}&region=bali`} variant="secondary" size="sm" iconEnd="arrowRight">{t('home.browse')}</ButtonLink>
              </div>
              <h3 className="font-display relative mt-6 text-2xl font-extrabold">{t(`categories.${cat}`)}</h3>
              <p className="relative mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{t(`home.categories.${cat}Desc`)}</p>
              <div className="relative mt-7 flex max-w-[88%] flex-wrap gap-2">
                {types.map((tp) => <Link key={tp} to={`/search?category=${cat}&type=${tp}&region=bali`} className="chip">{t(`vehicleTypes.${tp}`)}</Link>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Featured ───── */}
      <section className="container-x pt-24">
        <SectionTitle eyebrow={t('home.featured.eyebrow')} title={t('home.featured.title')}
          action={<ButtonLink to="/search?sort=rating&region=bali" variant="ghost" iconEnd="arrowRight">{t('home.viewAll')}</ButtonLink>} />
        <div className="scrollbar-none -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-[78%] shrink-0 snap-start sm:w-auto"><VehicleCardSkeleton /></div>)}
          {featured?.items.slice(0, 8).map((v) => <div key={v.id} className="w-[78%] shrink-0 snap-start sm:w-auto"><VehicleCard v={v} /></div>)}
        </div>
      </section>

      {/* ───── How it works ───── */}
      <HowItWorks listHref={listHref} />

      {/* ───── Trust ───── */}
      <section className="container-x pt-24">
        <SectionTitle eyebrow={t('home.trust.eyebrow')} title={t('home.trust.title')} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[['shield', 'verify'], ['document', 'checklist'], ['wallet', 'payments'], ['star', 'reviews']].map(([icon, k]) => (
            <div key={k} className="card spotlight card-hover group relative overflow-hidden p-6">
              <span aria-hidden="true" className="absolute inset-x-6 top-0 h-[2px] origin-left scale-x-0 rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition duration-700 group-hover:scale-x-100 rtl:origin-right" />
              <span className="neu-icon h-12 w-12"><Icon name={icon} size={22} /></span>
              <h3 className="mt-5 font-bold text-ink-950">{t(`home.trust.${k}`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{t(`home.trust.${k}d`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Universities: gliding row ───── */}
      {!!unis?.items.length && (
        <section className="pt-24">
          <div className="container-x">
            <SectionTitle eyebrow={t('home.unis.eyebrow')} title={t('home.unis.title')}
              action={<ButtonLink to="/universities" variant="ghost" iconEnd="arrowRight">{t('home.viewAll')}</ButtonLink>} />
          </div>
          <div className="marquee marquee-reverse" style={{ ['--dur' as any]: '60s' }}>
            <div className="marquee-track gap-4 py-3">
              {[...unis.items, ...unis.items].map((u, i) => {
                const dup = i >= unis.items.length;
                return (
                  <Link key={`${u.id}-${i}`} to={`/universities/${u.slug}`} aria-hidden={dup || undefined} tabIndex={dup ? -1 : undefined}
                    className="card group flex w-64 shrink-0 items-center gap-3.5 p-4">
                    <span className="neu-icon h-12 w-12 shrink-0"><Icon name="graduation" /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold text-ink-950">{u.short_name}</span>
                      <span className="block truncate text-xs text-ink-500">{u.city_name}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-brand-600">{t('home.unis.vehicles', { n: num(u.vehicle_count) })}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───── Earn CTA ───── */}
      <section className="container-x pt-24">
        <div data-reveal className="relative overflow-hidden rounded-[2rem] bg-ink-950 px-7 py-12 text-white shadow-[0_40px_80px_-30px_rgb(10_22_48/0.7)] sm:px-12 sm:py-16">
          <Aurora dark />
          <div className="grid-bg opacity-40 [filter:invert(1)]" />
          <div className="relative grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="eyebrow text-cyan-300">{t('nav.listVehicle')}</span>
              <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight sm:text-[2.6rem] sm:leading-tight">{t('home.earn.title')}</h2>
              <p className="mt-4 max-w-lg text-ink-300">{t('home.earn.body')}</p>
              <div className="mt-9"><ButtonLink to={listHref} variant="brand" size="lg" iconEnd="arrowRight">{t('home.earn.cta')}</ButtonLink></div>
            </div>
            <div className="glass-dark rounded-3xl p-6 sm:p-7">
              <div className="text-sm font-semibold text-ink-300">{t('home.earn.example')}</div>
              <div className="mt-5 flex h-28 items-end gap-2" aria-hidden="true">
                {[45, 60, 38, 72, 55, 85, 66, 92, 70, 100, 78, 88].map((h, i) => (
                  <span key={i} className="bar-anim flex-1 rounded-t-md bg-gradient-to-t from-brand-600 to-cyan-300" style={{ height: `${h}%`, animationDelay: `${i * 0.15}s`, animationDuration: '3.4s' }} />
                ))}
              </div>
              <div className="mt-6 space-y-2.5 text-sm">
                <Row label={t('home.earn.rentals')} value={num(20)} />
                <Row label={t('home.earn.avg')} value={money(20000)} />
                <Row label={t('home.earn.gross')} value={money(400000)} />
                <Row label={t('home.earn.fee', { pct: num(10) })} value={'− ' + money(40000)} />
                <div className="h-px bg-white/10" />
                <Row label={t('home.earn.youEarn')} value={money(360000)} strong />
              </div>
              <p className="mt-4 text-xs text-ink-400">{t('home.earn.disclaimer')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Two journeys (renter / owner) as an auto-playing, connected three-step timeline. */
function HowItWorks({ listHref }: { listHref: string }) {
  const t = useT();
  const { num } = useFormat();
  const [side, setSide] = useState<'renter' | 'owner'>('renter');
  const [active, setActive] = useCycle(3, 3200);
  const icons = side === 'renter' ? ['search', 'wallet', 'qr'] : ['camera', 'shield', 'chart'];
  return (
    <section className="container-x pt-28">
      <div className="text-center">
        <span className="eyebrow justify-center">{t('home.how.eyebrow')}</span>
        <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">{t('home.how.title')}</h2>
        <div className="relative mx-auto mt-8 grid w-full max-w-sm grid-cols-2 rounded-2xl border border-ink-200 bg-white p-1 shadow-sm">
          <span aria-hidden="true" className={cx('absolute inset-y-1 w-[calc(50%-4px)] rounded-xl bg-ink-950 transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]',
            side === 'renter' ? 'start-1' : 'start-[calc(50%+2px)]')} />
          {(['renter', 'owner'] as const).map((s) => (
            <button key={s} onClick={() => { setSide(s); setActive(0); }}
              className={cx('relative z-10 h-11 rounded-xl text-sm font-bold transition-colors duration-300', side === s ? 'text-white' : 'text-ink-600 hover:text-ink-900')}>
              {t(`home.how.${s}.label`)}
            </button>
          ))}
        </div>
        <p key={side} className="mt-5 animate-fade-up text-lg font-semibold text-ink-700">{t(`home.how.${side}.title`)}</p>
      </div>

      <div className="relative mt-12">
        {/* Connecting rail with a light that fills up to the active step */}
        <div aria-hidden="true" className="absolute inset-x-[16.6%] top-9 hidden h-[3px] rounded-full bg-ink-200 md:block">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 shadow-[0_0_12px_rgb(47_118_255/0.6)] transition-all duration-700 ease-[cubic-bezier(.16,1,.3,1)] rtl:bg-gradient-to-l"
            style={{ width: `${active * 50}%` }} />
        </div>
        <ol key={side} className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((n, i) => {
            const on = i === active, done = i < active;
            return (
              <li key={n} onMouseEnter={() => setActive(i)} className="group flex flex-col items-center text-center">
                <span className={cx('relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 bg-white transition-all duration-500',
                  on ? 'scale-110 border-brand-500 text-brand-600 shadow-[0_0_0_8px_rgb(47_118_255/0.1),0_14px_30px_-10px_rgb(47_118_255/0.6)]' : done ? 'border-brand-300 text-brand-500' : 'border-ink-200 text-ink-400')}>
                  {on && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full border-2 border-brand-400/50" />}
                  <Icon name={icons[i]} size={28} />
                  <span className={cx('absolute -end-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold transition-colors duration-500',
                    on || done ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-600')}>{num(n)}</span>
                </span>
                <div className={cx('card mt-6 w-full p-6 transition-all duration-500', on && 'border-brand-200 shadow-lift')}>
                  <div className="font-bold text-ink-950">{t(`home.how.${side}.s${n}`)}</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-ink-500">{t(`home.how.${side}.s${n}d`)}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="mt-10 text-center">
        {side === 'renter'
          ? <ButtonLink to="/search?region=bali" variant="brand" size="lg" iconEnd="arrowRight">{t('home.how.renter.cta')}</ButtonLink>
          : <ButtonLink to={listHref} variant="primary" size="lg" iconEnd="arrowRight">{t('home.how.owner.cta')}</ButtonLink>}
      </div>
    </section>
  );
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-4"><span className={strong ? 'font-bold text-white' : 'text-ink-300'}>{label}</span>
    <span className={strong ? 'text-xl font-extrabold text-cyan-300' : 'font-semibold text-white'}>{value}</span></div>
);

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-9 flex items-end justify-between gap-4">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** City select with Bali areas first (default market), then every other city in Indonesia. */
export function CityOptions({ cities }: { cities: any[] }) {
  const t = useT();
  const bali = cities.filter((c) => c.province_slug === 'prov-bali');
  const other = cities.filter((c) => c.province_slug !== 'prov-bali');
  return (
    <>
      <option value="">{t('home.allBali')}</option>
      <optgroup label="Bali">{bali.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
      <option value="all">{t('home.allIndonesia')}</option>
      <optgroup label={t('home.otherCities')}>{other.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
    </>
  );
}

