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
import { CountUp, useCycle, useScrollScale } from '../lib/motion';
import { AREA_PHOTOS } from '../photos';

const BIKE_TYPES = ['city', 'mountain', 'road', 'folding', 'electric_bicycle', 'student'];
const MOTO_TYPES = ['scooter', 'automatic', 'manual', 'electric_motorcycle'];

/* Calm tint under each area photo (and in its place while it loads). */
const AREA_TINT: Record<string, string> = {
  ubud: 'linear-gradient(170deg,#3a4a3f,#1d2a22)', canggu: 'linear-gradient(170deg,#2a4b5c,#14262f)', uluwatu: 'linear-gradient(170deg,#2c4f73,#13263a)',
  seminyak: 'linear-gradient(170deg,#5a4a3e,#2a211b)', kuta: 'linear-gradient(170deg,#3d5a73,#1b2a38)', sanur: 'linear-gradient(170deg,#4a6b80,#22333f)',
  denpasar: 'linear-gradient(170deg,#43474f,#1d1f23)', 'nusa-dua': 'linear-gradient(170deg,#2f6a6a,#143232)',
};

/** "Text link ›" in the Apple manner. */
const More = ({ to, children, light }: { to: string; children: ReactNode; light?: boolean }) => (
  <Link to={to} className={cx('group inline-flex items-center gap-0.5 text-[17px] font-medium', light ? 'text-[#2997ff]' : 'text-brand-600')}>
    <span className="group-hover:underline">{children}</span>
    <Icon name="chevronRight" size={18} className="transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
  </Link>
);

function Band({ tone = 'white', className, children }: { tone?: 'white' | 'gray' | 'black'; className?: string; children: ReactNode }) {
  return <section className={cx(tone === 'gray' ? 'bg-ink-100' : tone === 'black' ? 'bg-black text-white' : 'bg-[#fbfbfd]', 'py-24 sm:py-32', className)}>{children}</section>;
}

function Heading({ eyebrow, title, sub, light }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; light?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && <div data-reveal className={cx('text-[17px] font-semibold', light ? 'text-[#2997ff]' : 'text-brand-600')}>{eyebrow}</div>}
      <h2 className={cx('font-display mt-2 text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-6xl', light ? 'text-white' : 'text-ink-950')}>{title}</h2>
      {sub && <p data-reveal className={cx('mx-auto mt-5 max-w-2xl text-lg leading-relaxed sm:text-xl', light ? 'text-ink-400' : 'text-ink-600')}>{sub}</p>}
    </div>
  );
}

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
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative mx-auto mb-4 grid w-full max-w-[280px] grid-cols-2 rounded-full bg-ink-200/70 p-1">
        <span aria-hidden="true" className={cx('absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_2px_8px_rgb(0_0_0/0.12)] transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]',
          category === 'bicycle' ? 'start-1' : 'start-[calc(50%+2px)]')} />
        {(['bicycle', 'motorcycle'] as const).map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={cx('relative z-10 flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors duration-300', category === c ? 'text-ink-950' : 'text-ink-600')}>
            <Icon name={c === 'bicycle' ? 'bike' : 'moto'} size={16} />{t(`categories.${c}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-[28px] bg-white p-2 shadow-[0_2px_4px_rgb(0_0_0/0.04),0_20px_50px_-20px_rgb(0_0_0/0.18)] ring-1 ring-black/5 sm:flex-row sm:rounded-full">
        <div className="relative flex-1">
          <Icon name="pin" size={18} className="pointer-events-none absolute start-4 top-1/2 z-10 -translate-y-1/2 text-ink-500" />
          <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className="h-12 rounded-full border-0 bg-transparent ps-11 text-base shadow-none focus:shadow-none" aria-label={t('search.city')}>
            <CityOptions cities={cities?.items ?? []} />
          </Select>
        </div>
        <Button variant="secondary" icon="locate" loading={locating} onClick={nearMe} className="h-12">{t('home.nearMe')}</Button>
        <Button variant="brand" icon="search" onClick={() => go()} className="h-12 px-7">{t('home.search')}</Button>
      </div>
      <div className={cx('grid transition-all duration-500', category === 'motorcycle' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <p className="overflow-hidden text-center text-sm text-ink-500"><span className="inline-block pt-3">{t('home.motoNote')}</span></p>
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
  const zoom = useScrollScale<HTMLDivElement>(0.86);

  return (
    <div className="-mb-24 overflow-x-clip">
      {/* ───── Hero ───── */}
      <section className="bg-[#fbfbfd] px-5 pb-10 pt-16 text-center sm:pt-24">
        <div className="animate-fade-up text-[17px] font-semibold text-brand-600 [animation-delay:100ms]">{t('home.badge')}</div>
        <h1 className="font-display mx-auto mt-3 max-w-5xl animate-fade-up text-[3rem] font-semibold leading-[1.04] tracking-[-0.035em] text-ink-950 [animation-delay:200ms] sm:text-7xl lg:text-[5.5rem]">
          {t('home.title1')}<br /><span className="text-gradient">{t('home.title2')}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-ink-600 [animation-delay:350ms] sm:text-[21px]">{t('home.subtitle')}</p>
        <div className="mt-10 animate-fade-up [animation-delay:500ms]"><HeroSearch /></div>
        <div className="mt-6 flex animate-fade-up flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-600 [animation-delay:650ms]">
          {['verified', 'checklist', 'payments'].map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><Icon name="check" size={15} strokeWidth={2.4} className="text-brand-600" />{t(`home.trustline.${k}`)}</span>
          ))}
        </div>
      </section>

      {/* Showcase: one real (demo) listing, zooming in as you scroll */}
      <div className="bg-[#fbfbfd] px-3 pb-8 sm:px-6">
        <div ref={zoom} className="relative mx-auto max-w-6xl origin-top overflow-hidden bg-ink-100 will-change-transform">
          {hero ? (
            <div className="grid items-center gap-8 p-6 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:p-16">
              <Link to={`/vehicles/${hero.id}`} className="block">
                {hero.cover_url && <img src={hero.cover_url} alt={hero.name} className="float-b mx-auto w-full max-w-xl rounded-3xl mix-blend-multiply" />}
              </Link>
              <div className="text-center lg:text-start">
                <div className="flex items-center justify-center gap-2 lg:justify-start">
                  <span className="text-sm font-semibold text-ink-500">{t(`vehicleTypes.${hero.type}`)}</span>{!!hero.is_demo && <DemoBadge />}
                </div>
                <h3 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{hero.name}</h3>
                <p className="mt-2 text-ink-600">{hero.brand} {hero.model}{hero.city_name ? ` · ${hero.city_name}` : ''}</p>
                {hero.from_price && <p className="mt-5 text-lg text-ink-950">{t('vehicle.from')} <b>{money(hero.from_price.price)}</b></p>}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-5 lg:justify-start">
                  <ButtonLink to={`/vehicles/${hero.id}`} variant="brand">{t('home.browse')}</ButtonLink>
                  <More to="/search?region=bali">{t('home.viewAll')}</More>
                </div>
                <div className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-start shadow-[0_8px_30px_-12px_rgb(0_0_0/0.2)]">
                  <span className="ping-dot h-2 w-2 rounded-full bg-[#34c759]" />
                  <span><span className="block text-xs text-ink-500">{t('home.preview.booked')}</span>
                    <span dir="ltr" className="font-mono text-base font-semibold tracking-[0.3em] text-ink-950">482 915</span></span>
                </div>
              </div>
            </div>
          ) : <div className="aspect-[16/8]" />}
        </div>
      </div>

      {/* ───── Numbers ───── */}
      {stats && (
        <Band className="!py-20">
          <div className="container-x grid grid-cols-2 gap-y-12 text-center md:grid-cols-4">
            {[['vehicles', stats.vehicles], ['cities', stats.bali_areas ?? stats.cities], ['universities', stats.universities], ['rentals', stats.completed]].map(([k, v]) => (
              <div key={k as string} data-reveal>
                <CountUp value={v as number} className="font-display block text-5xl font-semibold tracking-[-0.03em] text-ink-950 sm:text-6xl" />
                <div className="mt-2 text-[15px] text-ink-600">{t(`home.stats.${k}`)}</div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-xs text-ink-400">{t('home.stats.note')}</p>
        </Band>
      )}

      {/* ───── Explore Bali ───── */}
      {baliAreas.length > 0 && (
        <Band tone="gray">
          <div className="container-x"><Heading eyebrow={t('home.areas.eyebrow')} title={t('home.areas.title')} /></div>
          <div className="marquee mt-14" style={{ ['--dur' as any]: '80s' }}>
            <div className="marquee-track gap-5 py-2">
              {[...baliAreas, ...baliAreas].map((a, i) => {
                const dup = i >= baliAreas.length;
                return (
                  <Link key={`${a.id}-${i}`} to={`/search?cityId=${a.id}`} aria-hidden={dup || undefined} tabIndex={dup ? -1 : undefined}
                    className="group relative block h-[420px] w-72 shrink-0 overflow-hidden rounded-[28px] sm:w-80"
                    style={{ background: AREA_TINT[a.slug] ?? AREA_TINT.denpasar }}>
                    {AREA_PHOTOS[a.slug] && <img src={AREA_PHOTOS[a.slug].src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-[1.6s] ease-out group-hover:scale-105" />}
                    <span className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/40" />
                    <span className="absolute inset-x-7 top-7 text-white">
                      <span className="block text-sm font-semibold text-white/75">{t('home.areas.vehicles', { n: num(a.vehicle_count) })}</span>
                      <span className="font-display mt-1 block text-3xl font-semibold tracking-tight">{a.name}</span>
                      <span className="mt-2 block text-[15px] leading-snug text-white/85">{t(`home.areas.tips.${a.slug}`)}</span>
                    </span>
                    <span className="absolute bottom-6 end-6 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition duration-500 group-hover:bg-white group-hover:text-ink-950">
                      <Icon name="plus" size={18} /></span>
                  </Link>
                );
              })}
            </div>
          </div>
        </Band>
      )}

      {/* ───── Categories ───── */}
      <Band>
        <div className="container-x">
          <Heading eyebrow={t('home.categories.eyebrow')} title={t('home.categories.title')} />
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {([['bicycle', BIKE_TYPES], ['motorcycle', MOTO_TYPES]] as const).map(([cat, types]) => (
              <div key={cat} data-reveal className="group relative flex min-h-[460px] flex-col items-center overflow-hidden rounded-[30px] bg-ink-100 px-8 pt-12 text-center">
                <h3 className="font-display text-4xl font-semibold tracking-tight">{t(`categories.${cat}`)}</h3>
                <p className="mt-3 max-w-sm text-[17px] text-ink-600">{t(`home.categories.${cat}Desc`)}</p>
                <div className="mt-5"><More to={`/search?category=${cat}&region=bali`}>{t('home.browse')}</More></div>
                <div className="mt-6 flex max-w-md flex-wrap justify-center gap-2">
                  {types.map((tp) => <Link key={tp} to={`/search?category=${cat}&type=${tp}&region=bali`} className="chip bg-white hover:bg-white hover:text-brand-600">{t(`vehicleTypes.${tp}`)}</Link>)}
                </div>
                <Icon name={cat === 'bicycle' ? 'bike' : 'moto'} size={260} strokeWidth={0.5} aria-hidden="true"
                  className="float-c pointer-events-none mt-auto -mb-16 text-ink-300 transition-colors duration-700 group-hover:text-brand-300" />
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* ───── Featured ───── */}
      <Band tone="gray">
        <div className="container-x">
          <Heading eyebrow={t('home.featured.eyebrow')} title={t('home.featured.title')} />
          <div className="mt-6 text-center"><More to="/search?sort=rating&region=bali">{t('home.viewAll')}</More></div>
          <div className="scrollbar-none -mx-5 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
            {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-[78%] shrink-0 snap-start sm:w-auto"><VehicleCardSkeleton /></div>)}
            {featured?.items.slice(0, 8).map((v) => <div key={v.id} className="w-[78%] shrink-0 snap-start sm:w-auto"><VehicleCard v={v} /></div>)}
          </div>
        </div>
      </Band>

      {/* ───── How it works ───── */}
      <HowItWorks listHref={listHref} />

      {/* ───── Trust ───── */}
      <Band tone="gray">
        <div className="container-x">
          <Heading eyebrow={t('home.trust.eyebrow')} title={t('home.trust.title')} />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[['shield', 'verify'], ['document', 'checklist'], ['wallet', 'payments'], ['star', 'reviews']].map(([icon, k]) => (
              <div key={k} className="card card-hover group rounded-[26px] border-0 p-8">
                <span className="neu-icon h-12 w-12"><Icon name={icon} size={22} /></span>
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-ink-950">{t(`home.trust.${k}`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{t(`home.trust.${k}d`)}</p>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* ───── Universities ───── */}
      {!!unis?.items.length && (
        <Band>
          <div className="container-x">
            <Heading eyebrow={t('home.unis.eyebrow')} title={t('home.unis.title')} />
            <div className="mt-6 text-center"><More to="/universities">{t('home.viewAll')}</More></div>
          </div>
          <div className="marquee marquee-reverse mt-12" style={{ ['--dur' as any]: '90s' }}>
            <div className="marquee-track gap-4 py-3">
              {[...unis.items, ...unis.items].map((u, i) => {
                const dup = i >= unis.items.length;
                return (
                  <Link key={`${u.id}-${i}`} to={`/universities/${u.slug}`} aria-hidden={dup || undefined} tabIndex={dup ? -1 : undefined}
                    className="group flex w-60 shrink-0 flex-col rounded-[22px] bg-ink-100 p-6 transition-colors duration-500 hover:bg-ink-200/70">
                    <span className="font-display text-2xl font-semibold tracking-tight text-ink-950">{u.short_name}</span>
                    <span className="mt-1 truncate text-sm text-ink-600">{u.city_name}</span>
                    <span className="mt-5 text-sm font-medium text-brand-600">{t('home.unis.vehicles', { n: num(u.vehicle_count) })}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </Band>
      )}

      {/* ───── Earn ───── */}
      <Band tone="black">
        <div className="container-x">
          <Heading light eyebrow={t('nav.listVehicle')} title={t('home.earn.title')} sub={t('home.earn.body')} />
          <div data-reveal className="mt-9 flex flex-wrap items-center justify-center gap-6">
            <ButtonLink to={listHref} variant="brand" size="lg">{t('home.earn.cta')}</ButtonLink>
            <More light to="/trust">{t('footer.trust')}</More>
          </div>
          <div data-reveal className="mx-auto mt-16 max-w-2xl rounded-[30px] bg-[#1d1d1f] p-8 sm:p-10">
            <div className="text-center text-sm font-medium text-ink-400">{t('home.earn.example')}</div>
            <div className="mt-8 flex h-32 items-end gap-2" aria-hidden="true">
              {[45, 60, 38, 72, 55, 85, 66, 92, 70, 100, 78, 88].map((h, i) => (
                <span key={i} className="bar-anim flex-1 rounded-full bg-gradient-to-t from-[#0071e3] to-[#5ac8fa]" style={{ height: `${h}%`, animationDelay: `${i * 0.2}s`, animationDuration: '4s' }} />
              ))}
            </div>
            <div className="mt-8 space-y-3 text-[15px]">
              <Row label={t('home.earn.rentals')} value={num(20)} />
              <Row label={t('home.earn.avg')} value={money(20000)} />
              <Row label={t('home.earn.gross')} value={money(400000)} />
              <Row label={t('home.earn.fee', { pct: num(10) })} value={'− ' + money(40000)} />
              <div className="h-px bg-white/10" />
              <Row label={t('home.earn.youEarn')} value={money(360000)} strong />
            </div>
            <p className="mt-5 text-center text-xs text-ink-500">{t('home.earn.disclaimer')}</p>
          </div>
        </div>
      </Band>
    </div>
  );
}

/** Two journeys (renter / owner) as an auto-playing three-step sequence with large numerals. */
function HowItWorks({ listHref }: { listHref: string }) {
  const t = useT();
  const { num } = useFormat();
  const [side, setSide] = useState<'renter' | 'owner'>('renter');
  const [active, setActive] = useCycle(3, 3600);
  return (
    <Band>
      <div className="container-x">
        <Heading eyebrow={t('home.how.eyebrow')} title={t('home.how.title')} />
        <div className="relative mx-auto mt-10 grid w-full max-w-xs grid-cols-2 rounded-full bg-ink-100 p-1">
          <span aria-hidden="true" className={cx('absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-ink-950 transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]',
            side === 'renter' ? 'start-1' : 'start-[calc(50%+2px)]')} />
          {(['renter', 'owner'] as const).map((s) => (
            <button key={s} onClick={() => { setSide(s); setActive(0); }}
              className={cx('relative z-10 h-10 rounded-full text-sm font-semibold transition-colors duration-300', side === s ? 'text-white' : 'text-ink-600 hover:text-ink-950')}>
              {t(`home.how.${s}.label`)}
            </button>
          ))}
        </div>

        <ol key={side} className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          {[1, 2, 3].map((n, i) => {
            const on = i === active;
            return (
              <li key={n} onMouseEnter={() => setActive(i)} className="cursor-default animate-fade-up text-center md:text-start" style={{ animationDelay: `${i * 120}ms` }}>
                <div className="h-[3px] overflow-hidden rounded-full bg-ink-200">
                  <div className={cx('h-full rounded-full bg-ink-950', on ? 'w-full transition-[width] duration-[3600ms] ease-linear' : i < active ? 'w-full' : 'w-0')} />
                </div>
                <div className={cx('font-display mt-6 text-7xl font-semibold tracking-tighter transition-colors duration-700', on ? 'text-gradient' : 'text-ink-200')}>{num(n).padStart(2, num(0))}</div>
                <h3 className={cx('mt-3 text-2xl font-semibold tracking-tight transition-colors duration-500', on ? 'text-ink-950' : 'text-ink-500')}>{t(`home.how.${side}.s${n}`)}</h3>
                <p className="mt-2 text-[17px] leading-relaxed text-ink-600">{t(`home.how.${side}.s${n}d`)}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-14 flex flex-wrap items-center justify-center gap-6">
          {side === 'renter'
            ? <ButtonLink to="/search?region=bali" variant="brand" size="lg">{t('home.how.renter.cta')}</ButtonLink>
            : <ButtonLink to={listHref} variant="primary" size="lg">{t('home.how.owner.cta')}</ButtonLink>}
        </div>
      </div>
    </Band>
  );
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-4"><span className={strong ? 'font-semibold text-white' : 'text-ink-400'}>{label}</span>
    <span className={strong ? 'text-2xl font-semibold text-white' : 'font-medium text-white'}>{value}</span></div>
);

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

