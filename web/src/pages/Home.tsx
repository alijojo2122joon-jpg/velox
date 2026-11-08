import { useState } from 'react';
import { useT } from '../i18n';
import { Link, navigate } from '../lib/router';
import { useApi } from '../lib/hooks';
import { qs } from '../lib/api';
import { useFormat } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/icons';
import { Button, ButtonLink, Select, cx, DemoBadge, StepDisc } from '../components/ui';
import { VehicleCard, VehicleCardSkeleton, type VehicleSummary } from '../components/VehicleCard';
import { SkyScene, GlassTiles, Cloud } from '../components/Sky';
import { Orb, StepOrb } from '../components/Orb';
import { PHOTOS, AREA_PHOTOS } from '../photos';

const BIKE_TYPES = ['city', 'mountain', 'road', 'folding', 'electric_bicycle', 'student'];
const MOTO_TYPES = ['scooter', 'automatic', 'manual', 'electric_motorcycle'];

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
    <div className="glass rounded-3xl p-2">
      <div className="flex gap-1 p-1">
        {(['bicycle', 'motorcycle'] as const).map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={cx('flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition sm:flex-none sm:px-5', category === c ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_8px_20px_-8px_rgb(43_118_255/0.6)]' : 'text-ink-700 hover:bg-white/70')}>
            <Icon name={c === 'bicycle' ? 'bike' : 'moto'} size={18} />{t(`categories.${c}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-1 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="pin" size={18} className="pointer-events-none absolute start-3.5 top-1/2 z-10 -translate-y-1/2 text-ink-400" />
          <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className="h-13 ps-10 text-base" aria-label={t('search.city')}>
            <CityOptions cities={cities?.items ?? []} />
          </Select>
        </div>
        <Button variant="secondary" size="lg" icon="locate" loading={locating} onClick={nearMe} className="h-13">{t('home.nearMe')}</Button>
        <Button variant="brand" size="lg" icon="search" onClick={() => go()} className="h-13">{t('home.search')}</Button>
      </div>
      {category === 'motorcycle' && (
        <p className="flex items-center gap-1.5 px-3 pb-2 pt-1 text-xs text-ink-500"><Icon name="shield" size={14} />{t('home.motoNote')}</p>
      )}
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
    <div>
      {/* ───── Hero: open sky, fluffy clouds, green hills ───── */}
      <section className="relative -mt-16 overflow-hidden pt-16">
        <SkyScene />
        <div className="container-x relative grid items-center gap-12 pb-44 pt-12 sm:pb-56 lg:grid-cols-[1.1fr_0.9fr] lg:pb-64 lg:pt-20">
          <div className="animate-fade-up">
            <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold text-ink-700">
              <span className="h-1.5 w-1.5 rounded-full bg-grass-500 shadow-[0_0_8px_#7cc625]" />{t('home.badge')}
            </span>
            <h1 className="font-display mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-ink-900 drop-shadow-[0_2px_0_rgb(255_255_255/0.6)] sm:text-6xl">
              {t('home.title1')}<br /><span className="text-sky-gradient">{t('home.title2')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-700">{t('home.subtitle')}</p>
            <div className="mt-8 max-w-2xl"><HeroSearch /></div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-ink-700">
              {['verified', 'checklist', 'payments'].map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 shadow-sm"><Icon name="check" size={13} className="text-grass-600" strokeWidth={2.6} /></span>{t(`home.trustline.${k}`)}</span>
              ))}
            </div>
          </div>

          {/* Product preview built from a real (demo) listing, floating like the clouds */}
          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            {hero ? (
              <div className="relative animate-float-slow">
                <VehicleCard v={hero} />
                <div className="glass absolute -start-12 bottom-24 w-56 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-grass-600"><Icon name="check" size={14} strokeWidth={2.6} />{t('home.preview.booked')}</div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">{t('home.preview.pickup')}</div>
                  <div className="mt-2 flex gap-1" dir="ltr">{'482915'.split('').map((d, i) => <span key={i} className="flex h-8 w-7 items-center justify-center rounded-lg bg-white/80 font-mono text-sm font-bold shadow-[inset_0_1px_3px_rgb(120_145_190/0.3)]">{d}</span>)}</div>
                </div>
                <div className="leather-dark absolute -end-8 -top-8 rounded-2xl px-4 py-3 text-white shadow-lift ring-1 ring-white/10">
                  <div className="text-[11px] text-ink-300">{t('home.preview.earned')}</div>
                  <div className="text-lg font-extrabold">{money(1240000)}</div>
                  <DemoBadge className="mt-1" />
                </div>
              </div>
            ) : <VehicleCardSkeleton />}
          </div>
        </div>
      </section>

      {/* ───── Live numbers (water-filled numerals) ───── */}
      {stats && (
        <section className="container-x relative z-10 -mt-24 sm:-mt-28">
          <div className="glass grid grid-cols-2 gap-6 rounded-3xl px-6 py-8 sm:px-10 md:grid-cols-4">
            {[['vehicles', stats.vehicles], ['cities', stats.bali_areas], ['universities', stats.universities], ['rentals', stats.completed]].map(([k, v]) => (
              <div key={k as string} className="text-center">
                <div className="text-water font-display text-5xl font-extrabold tracking-tight sm:text-6xl">{num(v as number)}</div>
                <div className="mt-1 text-sm font-semibold text-ink-600">{t(`home.stats.${k}`)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center text-xs text-ink-400">{t('home.stats.note')}</div>
        </section>
      )}

      {/* ───── Categories ───── */}
      <section className="container-x pt-20">
        <SectionTitle eyebrow={t('home.categories.eyebrow')} title={t('home.categories.title')} />
        <div className="grid gap-5 md:grid-cols-2">
          {([['bicycle', BIKE_TYPES], ['motorcycle', MOTO_TYPES]] as const).map(([cat, types]) => (
            <div key={cat} className="card relative overflow-hidden p-6 sm:p-8">
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -end-16 h-44 w-44 rounded-full opacity-90 shadow-[inset_0_0_0_6px_rgb(255_255_255/0.8),0_20px_40px_-12px_rgb(40_80_15/0.45)]"
                style={{ background: `url(${cat === 'bicycle' ? PHOTOS.pebbles.src : PHOTOS.grass.src}) center / cover` }} />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <span className={cx('neu-icon h-14 w-14', cat === 'motorcycle' && 'text-grass-600')}>
                    <Icon name={cat === 'bicycle' ? 'bike' : 'moto'} size={26} />
                  </span>
                  <h3 className="mt-4 text-xl font-bold">{t(`categories.${cat}`)}</h3>
                  <p className="mt-1 max-w-sm text-sm text-ink-500">{t(`home.categories.${cat}Desc`)}</p>
                </div>
                <ButtonLink to={`/search?category=${cat}&region=bali`} variant="secondary" size="sm" iconEnd="arrowRight">{t('home.browse')}</ButtonLink>
              </div>
              <div className="relative z-10 mt-6 flex max-w-[85%] flex-wrap gap-2.5">
                {types.map((tp) => <Link key={tp} to={`/search?category=${cat}&type=${tp}&region=bali`} className="pebble">{t(`vehicleTypes.${tp}`)}</Link>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Explore Bali: photo orbs ───── */}
      {baliAreas.length > 0 && (
        <section className="container-x pt-24">
          <SectionTitle eyebrow={t('home.areas.eyebrow')} title={t('home.areas.title')} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-4">
            {baliAreas.map((a, i) => (
              <Link key={a.id} to={`/search?cityId=${a.id}`} className="group flex flex-col items-center text-center">
                <Orb size={150} photo={AREA_PHOTOS[a.slug]?.src} color={i % 2 ? '#7cc625' : '#2b76ff'} color2={i % 2 ? '#2b76ff' : '#7cc625'}
                  className="transition duration-500 group-hover:-translate-y-1.5 group-hover:scale-[1.03]" />
                <div className="font-display mt-5 text-lg font-extrabold text-ink-900">{a.name}</div>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-ink-700 shadow-sm">
                  <Icon name="bike" size={13} />{t('home.areas.vehicles', { n: num(a.vehicle_count) })}</div>
                <p className="mt-2 max-w-[13rem] text-xs leading-relaxed text-ink-500">{t(`home.areas.tips.${a.slug}`)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ───── Featured ───── */}
      <section className="container-x pt-20">
        <SectionTitle eyebrow={t('home.featured.eyebrow')} title={t('home.featured.title')}
          action={<ButtonLink to="/search?sort=rating&region=bali" variant="ghost" iconEnd="arrowRight">{t('home.viewAll')}</ButtonLink>} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {loading && Array.from({ length: 4 }).map((_, i) => <VehicleCardSkeleton key={i} />)}
          {featured?.items.slice(0, 8).map((v) => <VehicleCard key={v.id} v={v} />)}
        </div>
      </section>

      {/* ───── How it works: infographic (central orb, connected step orbs) ───── */}
      <section className="container-x pt-28">
        <SectionTitle eyebrow={t('home.how.eyebrow')} title={t('home.how.title')} center />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
          {/* Center */}
          <div className="order-first flex justify-center lg:order-none">
            <Orb size={210} rings={3} color="#2b76ff" color2="#7cc625">
              <div className="flex flex-col items-center px-6 text-center">
                <svg width="46" height="46" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#2b76ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cx="19" cy="40" r="9" /><circle cx="45" cy="40" r="9" /><path d="M19 40l8-15h12l6 15M27 25l5 15h-13M36 19h6" /></g><circle cx="45" cy="17" r="4" fill="#7cc625" /></svg>
                <div className="font-display mt-2 text-lg font-extrabold leading-tight text-ink-900">Bali Bike</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">{t('home.how.eyebrow')}</div>
              </div>
            </Orb>
          </div>
          {(['owner', 'renter'] as const).map((side) => {
            const colors = side === 'renter' ? ['#2b76ff', '#0ea5e9', '#14b8a6'] : ['#7cc625', '#4caf50', '#0d9488'];
            const icons = side === 'renter' ? ['search', 'wallet', 'qr'] : ['camera', 'shield', 'chart'];
            return (
              <div key={side} className={cx(side === 'owner' ? 'lg:order-first' : '')}>
                <div className={cx('mb-6', side === 'owner' && 'lg:text-end')}>
                  <div className={cx('text-sm font-bold uppercase tracking-wider', side === 'renter' ? 'text-brand-600' : 'text-grass-600')}>{t(`home.how.${side}.label`)}</div>
                  <h3 className="mt-1 text-2xl font-bold">{t(`home.how.${side}.title`)}</h3>
                </div>
                <ol className="space-y-7">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className={cx('relative flex items-center gap-5', side === 'owner' && 'lg:flex-row-reverse lg:text-end')}>
                      <StepOrb icon={icons[n - 1]} n={num(n)} color={colors[n - 1]} />
                      {/* animated connector toward the central orb (desktop) */}
                      <svg aria-hidden="true" className={cx('pointer-events-none absolute top-1/2 hidden h-2 w-16 -translate-y-1/2 lg:block', side === 'renter' ? '-start-[4.5rem] rtl:-scale-x-100' : '-end-[4.5rem] -scale-x-100 rtl:scale-x-100')} viewBox="0 0 64 8">
                        <line x1="0" y1="4" x2="64" y2="4" stroke={colors[n - 1]} strokeWidth="2" strokeLinecap="round" className="flow-line" style={{ filter: `drop-shadow(0 0 3px ${colors[n - 1]})` }} />
                      </svg>
                      <div className="card flex-1 px-5 py-4">
                        <div className="font-bold">{t(`home.how.${side}.s${n}`)}</div>
                        <div className="mt-0.5 text-sm text-ink-500">{t(`home.how.${side}.s${n}d`)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className={cx('mt-7', side === 'owner' && 'lg:text-end')}>
                  {side === 'renter'
                    ? <ButtonLink to="/search?region=bali" variant="brand" iconEnd="arrowRight">{t('home.how.renter.cta')}</ButtonLink>
                    : <ButtonLink to={listHref} variant="success" iconEnd="arrowRight">{t('home.how.owner.cta')}</ButtonLink>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── Trust (beige leather band) ───── */}
      <section className="container-x pt-24">
        <div className="leather-beige rounded-[2rem] p-6 shadow-lift ring-1 ring-white/70 sm:p-10">
        <SectionTitle eyebrow={t('home.trust.eyebrow')} title={t('home.trust.title')} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[['shield', 'verify'], ['document', 'checklist'], ['wallet', 'payments'], ['star', 'reviews']].map(([icon, k]) => (
            <div key={k} className="card p-6">
              <span className="neu-icon h-14 w-14"><Icon name={icon} size={24} /></span>
              <h3 className="mt-5 font-bold">{t(`home.trust.${k}`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{t(`home.trust.${k}d`)}</p>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ───── Universities ───── */}
      <section className="container-x pt-24">
        <SectionTitle eyebrow={t('home.unis.eyebrow')} title={t('home.unis.title')}
          action={<ButtonLink to="/universities" variant="ghost" iconEnd="arrowRight">{t('home.viewAll')}</ButtonLink>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {unis?.items.slice(0, 12).map((u) => (
            <Link key={u.id} to={`/universities/${u.slug}`} className="card group p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className="neu-icon h-11 w-11"><Icon name="graduation" /></span>
              <div className="mt-3 font-extrabold text-ink-900">{u.short_name}</div>
              <div className="text-xs text-ink-500">{u.city_name}</div>
              <div className="mt-2 text-xs font-semibold text-brand-600">{t('home.unis.vehicles', { n: num(u.vehicle_count) })}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ───── Earn CTA: glass mosaic ───── */}
      <section className="container-x pt-24">
        <div className="relative overflow-hidden rounded-[2rem] px-7 py-12 shadow-lift ring-1 ring-white/60 sm:px-12 sm:py-16">
          <div aria-hidden="true" className="texture-pan absolute inset-0 bg-cover" style={{ backgroundImage: `url(${PHOTOS.leatherGreen.src})`, backgroundSize: '140%' }} />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(110deg,rgb(244_249_240/0.94)_0%,rgb(244_249_240/0.82)_45%,rgb(244_249_240/0.25)_100%)] rtl:bg-[linear-gradient(250deg,rgb(244_249_240/0.94)_0%,rgb(244_249_240/0.82)_45%,rgb(244_249_240/0.25)_100%)]" />
          <Cloud className="pointer-events-none absolute -end-10 -top-8 w-56 animate-float-slow opacity-90" shadow={false} />
          <div className="relative grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">{t('home.earn.title')}</h2>
              <p className="mt-4 max-w-lg text-ink-600">{t('home.earn.body')}</p>
              <div className="glass mt-8 max-w-md rounded-2xl p-5">
                <div className="text-sm font-semibold text-ink-500">{t('home.earn.example')}</div>
                <div className="mt-3 space-y-2.5 text-sm">
                  <Row label={t('home.earn.rentals')} value={num(20)} />
                  <Row label={t('home.earn.avg')} value={money(20000)} />
                  <Row label={t('home.earn.gross')} value={money(400000)} />
                  <Row label={t('home.earn.fee', { pct: num(10) })} value={'− ' + money(40000)} />
                  <div className="h-px bg-ink-200/70" />
                  <Row label={t('home.earn.youEarn')} value={money(360000)} strong />
                </div>
                <p className="mt-3 text-xs text-ink-400">{t('home.earn.disclaimer')}</p>
              </div>
              <div className="mt-8"><ButtonLink to={listHref} variant="brand" size="lg" iconEnd="arrowRight">{t('home.earn.cta')}</ButtonLink></div>
            </div>
            <GlassTiles className="mx-auto hidden w-full max-w-md lg:block" />
          </div>
        </div>
      </section>
    </div>
  );
}

const AREA_BG = [
  'linear-gradient(160deg,#bfe0fa,#eaf5fd 70%)', 'linear-gradient(160deg,#d8f2a6,#f2fbe3 70%)', 'linear-gradient(160deg,#c7e3ff,#f0f7ff 70%)',
  'linear-gradient(160deg,#bdeee4,#ecfbf7 70%)', 'linear-gradient(160deg,#cfe0ff,#f3f6ff 70%)', 'linear-gradient(160deg,#e2f5b8,#f7fdea 70%)',
  'linear-gradient(160deg,#b8e2f7,#eef9fe 70%)', 'linear-gradient(160deg,#d6e9ff,#f5f9ff 70%)',
];

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

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-4"><span className={strong ? 'font-bold text-ink-900' : 'text-ink-500'}>{label}</span>
    <span className={strong ? 'text-xl font-extrabold text-brand-600' : 'font-semibold text-ink-900'}>{value}</span></div>
);

function SectionTitle({ eyebrow, title, action, center }: { eyebrow: string; title: string; action?: React.ReactNode; center?: boolean }) {
  return (
    <div className={cx('mb-8 flex items-end justify-between gap-4', center && 'justify-center text-center')}>
      <div>
        <div className="text-sm font-bold uppercase tracking-wider text-brand-600">{eyebrow}</div>
        <h2 className="font-display mt-2 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
