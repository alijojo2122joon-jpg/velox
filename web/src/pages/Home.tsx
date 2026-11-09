import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Link, navigate } from '../lib/router';
import { useApi } from '../lib/hooks';
import { qs } from '../lib/api';
import { useFormat } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/icons';
import { Button, ButtonLink, Select, Seg, cx, DemoBadge } from '../components/ui';
import { VehicleCard, VehicleCardSkeleton, type VehicleSummary } from '../components/VehicleCard';
import { MapView, usePinLabel } from '../components/MapView';
import { CountUp, useCycle } from '../lib/motion';
import { AREA_PHOTOS } from '../photos';

const BIKE_TYPES = ['city', 'mountain', 'road', 'folding', 'electric_bicycle', 'student'];
const MOTO_TYPES = ['scooter', 'automatic', 'manual', 'electric_motorcycle'];
const AREA_TINT = 'linear-gradient(145deg,#cfe0f5,#9fbde3)';

/** Section title in the app style: small muted label over a heavy heading, optional action on the side. */
function Title({ eyebrow, title, action }: { eyebrow: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 px-1">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight text-ink-950 sm:text-[2rem]">{title}</h2>
      </div>
      {action}
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
    <div className="space-y-3">
      <Seg value={category} onChange={setCategory} className="max-w-sm"
        items={(['bicycle', 'motorcycle'] as const).map((c) => ({ value: c, label: <><Icon name={c === 'bicycle' ? 'bike' : 'moto'} size={17} />{t(`categories.${c}`)}</> }))} />
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="pin" size={18} className="pointer-events-none absolute start-3.5 top-1/2 z-10 -translate-y-1/2 text-brand-600" />
          <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className="h-14 ps-10 text-base font-semibold" aria-label={t('search.city')}>
            <CityOptions cities={cities?.items ?? []} />
          </Select>
        </div>
        <Button variant="secondary" size="lg" icon="locate" loading={locating} onClick={nearMe}>{t('home.nearMe')}</Button>
        <Button variant="brand" size="lg" icon="search" onClick={() => go()} className="sm:min-w-[150px]">{t('home.search')}</Button>
      </div>
      <div className={cx('grid transition-all duration-500', category === 'motorcycle' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <p className="flex items-center gap-1.5 overflow-hidden text-xs font-semibold text-ink-500"><Icon name="shield" size={14} className="text-brand-600" />{t('home.motoNote')}</p>
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
    <div className="space-y-20 pb-4 pt-4 sm:space-y-24 sm:pt-8">
      {/* ───── Hero ───── */}
      <section className="container-x">
        <div className="grid items-center gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="glass glow sweep drift relative p-6 sm:p-10" style={{ ['--bd' as any]: '8s' }}>
            <span className="field inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-ink-600">
              <span className="live-dot" />{t('home.badge')}
            </span>
            <h1 className="mt-5 text-[2.4rem] font-black leading-[1.1] tracking-tight text-ink-950 sm:text-6xl">
              {t('home.title1')}<br /><span className="text-gradient">{t('home.title2')}</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-600 sm:text-lg">{t('home.subtitle')}</p>
            <div className="mt-7"><HeroSearch /></div>
            <div className="mt-6 flex flex-wrap gap-2">
              {['verified', 'checklist', 'payments'].map((k) => (
                <span key={k} className="chip pointer-events-none"><Icon name="check" size={14} strokeWidth={2.6} className="text-emerald-600" />{t(`home.trustline.${k}`)}</span>
              ))}
            </div>
          </div>

          {/* Preview built from a real (demo) listing */}
          <div className="relative hidden lg:block">
            {hero ? (
              <div className="relative">
                <div className="glow rounded-[24px]" style={{ ['--bd' as any]: '9s', ['--bdl' as any]: '-3s' }} data-noreveal><VehicleCard v={hero} /></div>
                <div className="glass float-b absolute -start-10 bottom-16 w-56 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600"><span className="live-dot" />{t('home.preview.booked')}</div>
                  <div className="mt-1 text-sm font-bold text-ink-900">{t('home.preview.pickup')}</div>
                  <div className="field mt-2.5 flex justify-between rounded-[14px] px-3 py-2 font-mono text-lg font-black tracking-widest text-ink-950" dir="ltr">482915</div>
                </div>
                <div className="glass float-c absolute -end-6 -top-8 px-4 py-3">
                  <div className="text-[11px] font-bold text-ink-500">{t('home.preview.earned')}</div>
                  <div className="text-lg font-black text-ink-950">{money(1240000)}</div>
                  <div className="mt-1 flex h-6 items-end gap-1" aria-hidden="true">
                    {[40, 65, 50, 80, 60, 95, 75].map((h, i) => <span key={i} className="bar-anim w-2 rounded-sm bg-gradient-to-t from-brand-700 to-brand-300" style={{ height: `${h}%`, animationDelay: `${i * 0.18}s` }} />)}
                  </div>
                  <DemoBadge className="mt-1.5" />
                </div>
              </div>
            ) : <VehicleCardSkeleton />}
          </div>
        </div>

        {/* Live numbers in an inset strip, like Market Analysts' levels row */}
        {stats && (
          <div data-reveal className="glass mt-6 p-2">
            <div className="field grid grid-cols-2 rounded-[18px] md:grid-cols-4">
              {[['vehicles', stats.vehicles, 'bike'], ['cities', stats.bali_areas ?? stats.cities, 'pin'], ['universities', stats.universities, 'graduation'], ['rentals', stats.completed, 'check']].map(([k, v, ic], i) => (
                <div key={k as string} className={cx('flex items-center gap-3 px-4 py-4 sm:px-6', i % 2 === 1 && 'border-s border-[var(--line)]', i >= 2 && 'border-t border-[var(--line)] md:border-t-0', i === 2 && 'md:border-s')}>
                  <span className="neu-icon hidden h-10 w-10 shrink-0 sm:inline-flex"><Icon name={ic as string} size={19} /></span>
                  <div className="min-w-0">
                    <CountUp value={v as number} className="block text-2xl font-black text-ink-950 sm:text-3xl" />
                    <div className="truncate text-xs font-semibold text-ink-500">{t(`home.stats.${k}`)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <LiveMap />

      {/* ───── Explore Bali ───── */}
      {baliAreas.length > 0 && (
        <section>
          <div className="container-x"><Title eyebrow={t('home.areas.eyebrow')} title={t('home.areas.title')} /></div>
          <div className="marquee" style={{ ['--dur' as any]: '60s' }}>
            <div className="marquee-track gap-4 px-2 py-6">
              {[...baliAreas, ...baliAreas].map((a, i) => {
                const dup = i >= baliAreas.length;
                return (
                  <Link key={`${a.id}-${i}`} to={`/search?cityId=${a.id}`} aria-hidden={dup || undefined} tabIndex={dup ? -1 : undefined}
                    className="glass card-hover group flex w-72 shrink-0 items-center gap-3.5 p-3 pe-4">
                    <span className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[18px] shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45)]" style={{ background: AREA_TINT }}>
                      {AREA_PHOTOS[a.slug] && <img src={AREA_PHOTOS[a.slug].src} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2"><b className="text-[17px] font-black text-ink-950">{a.name}</b>
                        <span className="chip pointer-events-none h-6 px-2 text-[11px]">{num(a.vehicle_count)}</span></span>
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-ink-500">{t(`home.areas.tips.${a.slug}`)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───── Categories ───── */}
      <section className="container-x">
        <Title eyebrow={t('home.categories.eyebrow')} title={t('home.categories.title')} />
        <div className="grid gap-5 md:grid-cols-2">
          {([['bicycle', BIKE_TYPES], ['motorcycle', MOTO_TYPES]] as const).map(([cat, types], i) => (
            <div key={cat} className="glass glow group p-6 sm:p-8" style={{ ['--bd' as any]: '9s', ['--bdl' as any]: `${-i * 4}s` }}>
              <div className="flex items-start justify-between gap-4">
                <span className="neu-icon h-16 w-16 rounded-[20px]"><Icon name={cat === 'bicycle' ? 'bike' : 'moto'} size={30} /></span>
                <ButtonLink to={`/search?category=${cat}&region=bali`} variant="secondary" size="sm" iconEnd="arrowRight">{t('home.browse')}</ButtonLink>
              </div>
              <h3 className="mt-5 text-2xl font-black">{t(`categories.${cat}`)}</h3>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-500">{t(`home.categories.${cat}Desc`)}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {types.map((tp) => <Link key={tp} to={`/search?category=${cat}&type=${tp}&region=bali`} className="chip">{t(`vehicleTypes.${tp}`)}</Link>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Featured ───── */}
      <section className="container-x">
        <Title eyebrow={t('home.featured.eyebrow')} title={t('home.featured.title')}
          action={<ButtonLink to="/search?sort=rating&region=bali" variant="secondary" size="sm" iconEnd="arrowRight">{t('home.viewAll')}</ButtonLink>} />
        <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-[78%] shrink-0 snap-start sm:w-auto"><VehicleCardSkeleton /></div>)}
          {featured?.items.slice(0, 8).map((v) => <div key={v.id} className="w-[78%] shrink-0 snap-start sm:w-auto"><VehicleCard v={v} /></div>)}
        </div>
      </section>

      <HowItWorks listHref={listHref} />

      {/* ───── Trust ───── */}
      <section className="container-x">
        <Title eyebrow={t('home.trust.eyebrow')} title={t('home.trust.title')} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['shield', 'verify'], ['document', 'checklist'], ['wallet', 'payments'], ['star', 'reviews']].map(([icon, k]) => (
            <div key={k} className="glass card-hover group p-6">
              <span className="neu-icon h-12 w-12"><Icon name={icon} size={22} /></span>
              <h3 className="mt-5 text-lg font-black text-ink-950">{t(`home.trust.${k}`)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{t(`home.trust.${k}d`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Universities ───── */}
      {!!unis?.items.length && (
        <section>
          <div className="container-x">
            <Title eyebrow={t('home.unis.eyebrow')} title={t('home.unis.title')}
              action={<ButtonLink to="/universities" variant="secondary" size="sm" iconEnd="arrowRight">{t('home.viewAll')}</ButtonLink>} />
          </div>
          <div className="marquee marquee-reverse" style={{ ['--dur' as any]: '70s' }}>
            <div className="marquee-track gap-4 px-2 py-6">
              {[...unis.items, ...unis.items].map((u, i) => {
                const dup = i >= unis.items.length;
                return (
                  <Link key={`${u.id}-${i}`} to={`/universities/${u.slug}`} aria-hidden={dup || undefined} tabIndex={dup ? -1 : undefined}
                    className="glass card-hover group flex w-64 shrink-0 items-center gap-3 p-3.5">
                    <span className="neu-icon h-12 w-12 shrink-0"><Icon name="graduation" /></span>
                    <span className="min-w-0">
                      <b className="block truncate font-black text-ink-950">{u.short_name}</b>
                      <span className="block truncate text-xs text-ink-500">{u.city_name}</span>
                      <span className="block text-xs font-bold text-brand-600">{t('home.unis.vehicles', { n: num(u.vehicle_count) })}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───── Earn ───── */}
      <section className="container-x">
        <div data-reveal className="glass glow sweep grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-2" style={{ ['--bd' as any]: '10s' }}>
          <div>
            <div className="eyebrow">{t('nav.listVehicle')}</div>
            <h2 className="mt-1 text-3xl font-black leading-tight tracking-tight sm:text-4xl">{t('home.earn.title')}</h2>
            <p className="mt-3 max-w-lg text-ink-600">{t('home.earn.body')}</p>
            <div className="mt-7"><ButtonLink to={listHref} variant="brand" size="lg" iconEnd="arrowRight">{t('home.earn.cta')}</ButtonLink></div>
          </div>
          <div>
            <div className="text-[13px] font-bold text-ink-500">{t('home.earn.example')}</div>
            <div className="field mt-3 flex h-28 items-end gap-1.5 rounded-[18px] p-3" aria-hidden="true">
              {[45, 60, 38, 72, 55, 85, 66, 92, 70, 100, 78, 88].map((h, i) => (
                <span key={i} className="bar-anim flex-1 rounded-md bg-gradient-to-t from-brand-700 via-brand-500 to-brand-300" style={{ height: `${h}%`, animationDelay: `${i * 0.18}s`, animationDuration: '3.6s' }} />
              ))}
            </div>
            <div className="field mt-3 grid grid-cols-3 rounded-[18px] text-center">
              <Lv label={t('home.earn.gross')} value={money(400000)} />
              <Lv label={t('home.earn.fee', { pct: num(10) })} value={'− ' + money(40000)} tone="text-red-500" />
              <Lv label={t('home.earn.youEarn')} value={money(360000)} tone="text-emerald-600" />
            </div>
            <p className="mt-3 text-xs text-ink-400">{t('home.earn.rentals')}: {num(20)} · {t('home.earn.avg')}: {money(20000)} — {t('home.earn.disclaimer')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

const Lv = ({ label, value, tone = 'text-ink-950' }: { label: string; value: string; tone?: string }) => (
  <div className="px-2 py-3 [&+&]:border-s [&+&]:border-[var(--line)]">
    <small className="block truncate text-[11px] font-semibold text-ink-500">{label}</small>
    <b className={cx('text-[15px] font-black sm:text-base', tone)}>{value}</b>
  </div>
);

/** Live map of every listing in Bali, filterable by category, linking to the full map search. */
function LiveMap() {
  const t = useT();
  const { num } = useFormat();
  const pin = usePinLabel();
  const [cat, setCat] = useState<'' | 'bicycle' | 'motorcycle'>('');
  const { data } = useApi<{ items: VehicleSummary[]; total: number }>('/api/vehicles?region=bali&limit=100' + (cat ? `&category=${cat}` : ''), [cat]);
  const points = (data?.items ?? []).filter((v) => v.lat != null && v.lng != null)
    .map((v) => ({ id: v.id, lat: v.lat!, lng: v.lng!, label: v.from_price ? pin(v.from_price.price) : t(`categories.${v.category}`) }));
  return (
    <section className="container-x">
      <Title eyebrow={t('home.map.eyebrow')} title={t('home.map.title')} />
      <div data-reveal className="glass glow p-2" style={{ ['--bd' as any]: '11s' }}>
        <div className="relative h-[440px] overflow-hidden rounded-[18px] sm:h-[540px]">
          <MapView points={points} center={{ lat: -8.55, lng: 115.17 }} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex flex-wrap items-center justify-between gap-2">
            <Seg value={cat} onChange={setCat} size="sm" className="pointer-events-auto bg-white/80 backdrop-blur"
              items={[{ value: '' as const, label: t('home.map.all') }, { value: 'bicycle' as const, label: t('categories.bicycle') }, { value: 'motorcycle' as const, label: t('categories.motorcycle') }]} />
            {data && <span className="glass pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold text-ink-700"><span className="live-dot" />{t('home.map.count', { n: num(data.total) })}</span>}
          </div>
          <div className="absolute inset-x-0 bottom-4 z-[400] flex justify-center">
            <ButtonLink to={`/search?region=bali${cat ? `&category=${cat}` : ''}`} variant="brand" icon="map">{t('home.map.open')}</ButtonLink>
          </div>
        </div>
      </div>
      <p className="mt-3 px-1 text-sm text-ink-500">{t('home.map.sub')}</p>
    </section>
  );
}

/** Two journeys (renter / owner) as an auto-playing list; the active step opens like Market Analysts' list rows. */
function HowItWorks({ listHref }: { listHref: string }) {
  const t = useT();
  const { num } = useFormat();
  const [side, setSide] = useState<'renter' | 'owner'>('renter');
  const [active, setActive] = useCycle(3, 3400);
  const icons = side === 'renter' ? ['search', 'wallet', 'qr'] : ['camera', 'shield', 'chart'];
  return (
    <section className="container-x">
      <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Title eyebrow={t('home.how.eyebrow')} title={t('home.how.title')} />
          <Seg value={side} onChange={(s) => { setSide(s); setActive(0); }} className="max-w-sm"
            items={[{ value: 'renter' as const, label: t('home.how.renter.label') }, { value: 'owner' as const, label: t('home.how.owner.label') }]} />
          <p className="mt-4 px-1 text-lg font-bold text-ink-700">{t(`home.how.${side}.title`)}</p>
          <div className="mt-6">
            {side === 'renter'
              ? <ButtonLink to="/search?region=bali" variant="brand" size="lg" iconEnd="arrowRight">{t('home.how.renter.cta')}</ButtonLink>
              : <ButtonLink to={listHref} variant="primary" size="lg" iconEnd="arrowRight">{t('home.how.owner.cta')}</ButtonLink>}
          </div>
        </div>
        <ol key={side} className="glass p-1.5">
          {[1, 2, 3].map((n, i) => {
            const on = i === active;
            return (
              <li key={n} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}
                className={cx('cursor-pointer rounded-[18px] transition-colors duration-500', on && 'field')} style={{ animation: `rise .85s cubic-bezier(.16,1,.3,1) ${i * 70}ms both` }}>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3.5">
                  <span className={cx('flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-500', on ? 'bg-brand-600 text-white shadow-[0_8px_18px_-8px_#2f7cf6]' : 'bg-brand-50 text-brand-600')}>
                    <Icon name={icons[i]} size={20} />
                  </span>
                  <b className="text-[15px] font-black text-ink-950">{t(`home.how.${side}.s${n}`)}</b>
                  <span className="chip pointer-events-none h-7 px-2.5 text-xs">{num(n)}</span>
                </div>
                <div className={cx('grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(.16,1,.3,1)]', on ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="overflow-hidden">
                    <p className="px-4 pb-4 ps-[4.4rem] text-sm leading-relaxed text-ink-600">{t(`home.how.${side}.s${n}d`)}</p>
                    <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-[var(--line)]">
                      <div className={cx('h-full rounded-full bg-brand-500', on ? 'w-full transition-[width] duration-[3400ms] ease-linear' : 'w-0')} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
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

