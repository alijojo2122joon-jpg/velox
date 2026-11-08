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
    <div className="rounded-3xl bg-white p-2 shadow-lift ring-1 ring-ink-900/5">
      <div className="flex gap-1 p-1">
        {(['bicycle', 'motorcycle'] as const).map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={cx('flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition sm:flex-none sm:px-5', category === c ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100')}>
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
      {/* ───── Hero ───── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_0%,rgba(47,98,255,0.10),transparent_70%)]" />
        <div className="container-x relative grid items-center gap-12 pb-16 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-20">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink-700 shadow-card ring-1 ring-ink-900/5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('home.badge')}
            </span>
            <h1 className="font-display mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
              {t('home.title1')}<br /><span className="text-brand-500">{t('home.title2')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500">{t('home.subtitle')}</p>
            <div className="mt-8 max-w-2xl"><HeroSearch /></div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
              {['verified', 'checklist', 'payments'].map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5"><Icon name="check" size={16} className="text-emerald-500" />{t(`home.trustline.${k}`)}</span>
              ))}
            </div>
          </div>

          {/* Product preview built from a real (demo) listing */}
          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            <div className="absolute -start-8 top-10 h-64 w-64 rounded-full bg-brand-200/50 blur-3xl" />
            {hero ? (
              <div className="relative animate-fade-up">
                <VehicleCard v={hero} />
                <div className="absolute -start-10 bottom-24 w-56 rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink-900/5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600"><Icon name="check" size={14} />{t('home.preview.booked')}</div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">{t('home.preview.pickup')}</div>
                  <div className="mt-2 flex gap-1" dir="ltr">{'482915'.split('').map((d, i) => <span key={i} className="flex h-8 w-7 items-center justify-center rounded-md bg-ink-100 font-mono text-sm font-bold">{d}</span>)}</div>
                </div>
                <div className="absolute -end-6 -top-6 rounded-2xl bg-ink-900 px-4 py-3 text-white shadow-lift">
                  <div className="text-[11px] text-ink-300">{t('home.preview.earned')}</div>
                  <div className="text-lg font-extrabold">{money(1240000)}</div>
                  <DemoBadge className="mt-1" />
                </div>
              </div>
            ) : <VehicleCardSkeleton />}
          </div>
        </div>
      </section>

      {/* ───── Live numbers ───── */}
      {stats && (
        <section className="border-y border-ink-900/5 bg-white">
          <div className="container-x grid grid-cols-2 gap-6 py-8 md:grid-cols-4">
            {[['vehicles', stats.vehicles], ['cities', stats.cities], ['universities', stats.universities], ['rentals', stats.completed]].map(([k, v]) => (
              <div key={k as string} className="text-center md:text-start">
                <div className="text-3xl font-extrabold tracking-tight text-ink-900">{num(v as number)}</div>
                <div className="mt-1 text-sm text-ink-500">{t(`home.stats.${k}`)}</div>
              </div>
            ))}
          </div>
          <div className="container-x -mt-4 pb-4 text-xs text-ink-400">{t('home.stats.note')}</div>
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
                  <span className={cx('inline-flex h-12 w-12 items-center justify-center rounded-2xl', cat === 'bicycle' ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-600')}>
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
            <div key={side} className={cx('rounded-3xl p-7 sm:p-9', side === 'renter' ? 'bg-white shadow-card ring-1 ring-ink-900/5' : 'bg-ink-900 text-white')}>
              <div className={cx('text-sm font-bold uppercase tracking-wider', side === 'renter' ? 'text-brand-600' : 'text-brand-300')}>{t(`home.how.${side}.label`)}</div>
              <h3 className="mt-2 text-2xl font-bold">{t(`home.how.${side}.title`)}</h3>
              <ol className="mt-7 space-y-6">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex gap-4">
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold', side === 'renter' ? 'bg-brand-50 text-brand-600' : 'bg-white/10 text-white')}>{num(n)}</span>
                    <div>
                      <div className="font-bold">{t(`home.how.${side}.s${n}`)}</div>
                      <div className={cx('mt-0.5 text-sm', side === 'renter' ? 'text-ink-500' : 'text-ink-300')}>{t(`home.how.${side}.s${n}d`)}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8">
                {side === 'renter'
                  ? <ButtonLink to="/search" variant="primary" iconEnd="arrowRight">{t('home.how.renter.cta')}</ButtonLink>
                  : <ButtonLink to={listHref} variant="brand" iconEnd="arrowRight">{t('home.how.owner.cta')}</ButtonLink>}
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
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-900 text-white"><Icon name={icon} /></span>
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon name="graduation" /></span>
              <div className="mt-3 font-extrabold text-ink-900">{u.short_name}</div>
              <div className="text-xs text-ink-500">{u.city_name}</div>
              <div className="mt-2 text-xs font-semibold text-brand-600">{t('home.unis.vehicles', { n: num(u.vehicle_count) })}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ───── Earn CTA ───── */}
      <section className="container-x pt-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink-900 px-7 py-12 text-white sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t('home.earn.title')}</h2>
              <p className="mt-4 max-w-lg text-ink-300">{t('home.earn.body')}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink to={listHref} variant="brand" size="lg" iconEnd="arrowRight">{t('home.earn.cta')}</ButtonLink>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <div className="text-sm text-ink-300">{t('home.earn.example')}</div>
              <div className="mt-4 space-y-3 text-sm">
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

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-4"><span className={strong ? 'font-bold text-white' : 'text-ink-300'}>{label}</span>
    <span className={strong ? 'text-xl font-extrabold text-white' : 'font-semibold text-white'}>{value}</span></div>
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
