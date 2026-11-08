import { useState } from 'react';
import { useT } from '../i18n';
import { Link, navigate } from '../lib/router';
import { useApi } from '../lib/hooks';
import { qs } from '../lib/api';
import { useFormat } from '../lib/format';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/icons';
import { Button, ButtonLink, Select, cx, DemoBadge } from '../components/ui';
import { VehicleCard, VehicleCardSkeleton, type VehicleSummary } from '../components/VehicleCard';
import { SkyScene, GlassTiles, Cloud } from '../components/Sky';

const BIKE_TYPES = ['city', 'mountain', 'road', 'folding', 'electric_bicycle', 'student'];
const MOTO_TYPES = ['scooter', 'automatic', 'manual', 'electric_motorcycle'];

function HeroSearch() {
  const t = useT();
  const { data: cities } = useApi<{ items: any[] }>('/api/locations/cities');
  const [category, setCategory] = useState<'bicycle' | 'motorcycle'>('bicycle');
  const [cityId, setCityId] = useState('');
  const [locating, setLocating] = useState(false);

  const go = (extra: Record<string, unknown> = {}) => navigate('/search' + qs({ category, cityId: cityId || undefined, ...extra }));
  const nearMe = () => {
    if (!navigator.geolocation) return go();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); go({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5), radiusKm: 2, sort: 'nearest', cityId: undefined }); },
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
            <option value="">{t('home.anyCity')}</option>
            {cities?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
  const { data: featured, loading } = useApi<{ items: VehicleSummary[] }>('/api/vehicles?sort=rating&category=bicycle');
  const { data: stats } = useApi<any>('/api/stats');
  const { data: unis } = useApi<{ items: any[] }>('/api/universities');
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
                <div className="glass-dark absolute -end-8 -top-8 rounded-2xl px-4 py-3 text-white">
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
            {[['vehicles', stats.vehicles], ['cities', stats.cities], ['universities', stats.universities], ['rentals', stats.completed]].map(([k, v]) => (
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
            <div key={cat} className="card overflow-hidden p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className={cx('neu-icon h-14 w-14', cat === 'motorcycle' && 'text-grass-600')}>
                    <Icon name={cat === 'bicycle' ? 'bike' : 'moto'} size={26} />
                  </span>
                  <h3 className="mt-4 text-xl font-bold">{t(`categories.${cat}`)}</h3>
                  <p className="mt-1 max-w-sm text-sm text-ink-500">{t(`home.categories.${cat}Desc`)}</p>
                </div>
                <ButtonLink to={`/search?category=${cat}`} variant="secondary" size="sm" iconEnd="arrowRight">{t('home.browse')}</ButtonLink>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {types.map((tp) => <Link key={tp} to={`/search?category=${cat}&type=${tp}`} className="chip">{t(`vehicleTypes.${tp}`)}</Link>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Featured ───── */}
      <section className="container-x pt-20">
        <SectionTitle eyebrow={t('home.featured.eyebrow')} title={t('home.featured.title')}
          action={<ButtonLink to="/search?sort=rating" variant="ghost" iconEnd="arrowRight">{t('home.viewAll')}</ButtonLink>} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {loading && Array.from({ length: 4 }).map((_, i) => <VehicleCardSkeleton key={i} />)}
          {featured?.items.slice(0, 8).map((v) => <VehicleCard key={v.id} v={v} />)}
        </div>
      </section>

      {/* ───── How it works ───── */}
      <section className="container-x pt-24">
        <SectionTitle eyebrow={t('home.how.eyebrow')} title={t('home.how.title')} center />
        <div className="grid gap-5 lg:grid-cols-2">
          {(['renter', 'owner'] as const).map((side) => (
            <div key={side} className={cx('rounded-3xl p-7 sm:p-9', side === 'renter' ? 'card' : 'relative overflow-hidden bg-[linear-gradient(150deg,#2b76ff_0%,#184bc6_55%,#123068_100%)] text-white shadow-lift')}>
              <div className={cx('text-sm font-bold uppercase tracking-wider', side === 'renter' ? 'text-brand-600' : 'text-grass-300')}>{t(`home.how.${side}.label`)}</div>
              <h3 className="mt-2 text-2xl font-bold">{t(`home.how.${side}.title`)}</h3>
              <ol className="mt-7 space-y-6">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex gap-4">
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold', side === 'renter' ? 'neu-icon h-9 w-9 rounded-xl' : 'bg-white/15 text-white ring-1 ring-white/25')}>{num(n)}</span>
                    <div>
                      <div className="font-bold">{t(`home.how.${side}.s${n}`)}</div>
                      <div className={cx('mt-0.5 text-sm', side === 'renter' ? 'text-ink-500' : 'text-brand-100')}>{t(`home.how.${side}.s${n}d`)}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8">
                {side === 'renter'
                  ? <ButtonLink to="/search" variant="primary" iconEnd="arrowRight">{t('home.how.renter.cta')}</ButtonLink>
                  : <ButtonLink to={listHref} variant="secondary" iconEnd="arrowRight">{t('home.how.owner.cta')}</ButtonLink>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Trust ───── */}
      <section className="container-x pt-24">
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
        <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(160deg,#e6f2fc_0%,#f6fbff_60%,#eef8e0_100%)] px-7 py-12 shadow-lift ring-1 ring-white sm:px-12 sm:py-16">
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
