import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { useLocation, setSearch } from '../lib/router';
import { useApi, useMediaQuery } from '../lib/hooks';
import { qs } from '../lib/api';
import { useFormat, localToIso } from '../lib/format';
import { Icon } from '../components/icons';
import { Button, Select, Input, Modal, cx, Empty, Notice } from '../components/ui';
import { VehicleCard, VehicleCardSkeleton, type VehicleSummary } from '../components/VehicleCard';
import { MapView, usePinLabel } from '../components/MapView';

const TYPES = { bicycle: ['city', 'mountain', 'road', 'folding', 'electric_bicycle', 'student'], motorcycle: ['scooter', 'automatic', 'manual', 'electric_motorcycle'] };
const SORTS = ['nearest', 'price', 'rating', 'newest', 'available_now'];

export function Search() {
  const t = useT();
  const { num } = useFormat();
  const { search } = useLocation();
  const p = Object.fromEntries(search);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [hovered, setHovered] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const pinLabel = usePinLabel();

  const { data: cities } = useApi<{ items: any[] }>('/api/locations/cities');
  const { data: unis } = useApi<{ items: any[] }>('/api/universities' + qs({ cityId: p.cityId }), [p.cityId]);
  const query = qs({ ...p, sort: p.sort ?? (p.lat ? 'nearest' : 'newest') });
  const { data, loading, error } = useApi<{ items: VehicleSummary[]; total: number; page: number; pages: number }>('/api/vehicles' + query, [query]);

  const page = Number(p.page ?? 1);
  const userLoc = p.lat && p.lng ? { lat: Number(p.lat), lng: Number(p.lng) } : null;
  const city = cities?.items.find((c) => String(c.id) === p.cityId);
  const points = useMemo(() => (data?.items ?? []).filter((v) => v.lat).map((v) => ({
    id: v.id, lat: v.lat!, lng: v.lng!, label: pinLabel(v.quote?.subtotal ?? v.from_price?.price ?? 0),
  })), [data, pinLabel]);

  const set = (o: Record<string, string | number | undefined>) => setSearch({ ...o, page: undefined });
  const nearMe = () => {
    if (!navigator.geolocation) { setGeoError(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setGeoError(false); set({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5), radiusKm: p.radiusKm ?? 2, sort: 'nearest', cityId: undefined, universityId: undefined }); },
      () => { setLocating(false); setGeoError(true); }, { timeout: 8000 });
  };
  const activeFilters = ['type', 'minPrice', 'maxPrice', 'minRating', 'start', 'universityId'].filter((k) => p[k]).length;

  const filterPanel = <Filters p={p} set={set} unis={unis?.items ?? []} />;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="border-b border-ink-900/5 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <div className="flex rounded-xl bg-ink-100 p-1">
            {(['', 'bicycle', 'motorcycle'] as const).map((c) => (
              <button key={c} onClick={() => set({ category: c || undefined, type: undefined })}
                className={cx('flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition', (p.category ?? '') === c ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600')}>
                {c && <Icon name={c === 'bicycle' ? 'bike' : 'moto'} size={16} />}{c ? t(`categories.${c}`) : t('search.all')}
              </button>
            ))}
          </div>
          <div className="w-44">
            <Select value={p.cityId ?? ''} onChange={(e) => set({ cityId: e.target.value || undefined, universityId: undefined, lat: undefined, lng: undefined, radiusKm: undefined, sort: undefined })} className="h-10 text-sm" aria-label={t('search.city')}>
              <option value="">{t('search.allCities')}</option>
              {cities?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <button onClick={nearMe} className={cx('chip h-10', userLoc && 'chip-on')}>
            <Icon name="locate" size={16} />{locating ? t('search.locating') : t('search.nearMe')}
          </button>
          {userLoc && (
            <div className="w-28">
              <Select value={p.radiusKm ?? '2'} onChange={(e) => set({ radiusKm: e.target.value })} className="h-10 text-sm" aria-label={t('search.radius')}>
                {[1, 2, 5, 10, 25].map((r) => <option key={r} value={r}>{t('units.km', { n: num(r) })}</option>)}
              </Select>
            </div>
          )}
          <button onClick={() => setFiltersOpen(true)} className={cx('chip h-10', activeFilters > 0 && 'chip-on')}>
            <Icon name="filter" size={16} />{t('search.filters')}{activeFilters > 0 && ` · ${num(activeFilters)}`}
          </button>
          <div className="ms-auto flex items-center gap-2">
            <div className="w-44">
              <Select value={p.sort ?? (userLoc ? 'nearest' : 'newest')} onChange={(e) => set({ sort: e.target.value })} className="h-10 text-sm" aria-label={t('search.sort')}>
                {SORTS.filter((s) => s !== 'nearest' || userLoc || p.universityId).map((s) => <option key={s} value={s}>{t(`search.sorts.${s}`)}</option>)}
              </Select>
            </div>
            {!isDesktop && (
              <div className="flex rounded-xl bg-ink-100 p-1">
                {(['list', 'map'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} aria-label={t(`search.${v}View`)}
                    className={cx('flex h-8 w-9 items-center justify-center rounded-lg', view === v ? 'bg-white shadow-sm' : 'text-ink-500')}><Icon name={v} size={18} /></button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Results list */}
        {(isDesktop || view === 'list') && (
          <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:max-w-[58%]">
            {geoError && <div className="mb-4"><Notice tone="warn">{t('search.geoError')}</Notice></div>}
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h1 className="text-lg font-bold">
                {loading ? t('search.searching') : t('search.results', { n: num(data?.total ?? 0) })}
                <span className="font-normal text-ink-500"> {userLoc ? t('search.nearYou') : city ? t('search.inCity', { city: city.name }) : t('search.inIndonesia')}</span>
              </h1>
            </div>
            {p.category === 'motorcycle' && <div className="mb-5"><Notice tone="info" icon="shield">{t('search.motoNotice')}</Notice></div>}
            {error && <Notice tone="error">{t('errors.INTERNAL')}</Notice>}
            <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
              {loading && !data && Array.from({ length: 6 }).map((_, i) => <VehicleCardSkeleton key={i} />)}
              {data?.items.map((v) => <VehicleCard key={v.id} v={v} highlighted={hovered === v.id} onHover={setHovered} compact />)}
            </div>
            {data && !data.items.length && (
              <Empty icon="search" title={t('search.emptyTitle')} body={t('search.emptyBody')}
                action={<Button variant="secondary" onClick={() => setSearch({ category: p.category }, true)}>{t('search.clear')}</Button>} />
            )}
            {data && data.pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3">
                <Button variant="secondary" size="sm" icon="arrowLeft" disabled={page <= 1} onClick={() => setSearch({ page: page - 1 }, false)}>{t('common.previous')}</Button>
                <span className="text-sm text-ink-500">{t('common.pageOf', { page: num(page), pages: num(data.pages) })}</span>
                <Button variant="secondary" size="sm" iconEnd="arrowRight" disabled={page >= data.pages} onClick={() => setSearch({ page: page + 1 }, false)}>{t('common.next')}</Button>
              </div>
            )}
          </div>
        )}
        {/* Map */}
        {(isDesktop || view === 'map') && (
          <div className={cx('relative flex-1', !isDesktop && 'h-[calc(100vh-8.5rem)]')}>
            <MapView points={points} highlighted={hovered} onHover={setHovered} userLocation={userLoc}
              center={city ? { lat: city.lat, lng: city.lng } : null} className="h-full w-full" />
          </div>
        )}
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('search.filters')}
        footer={<><Button variant="ghost" onClick={() => { set({ type: undefined, minPrice: undefined, maxPrice: undefined, minRating: undefined, start: undefined, end: undefined, universityId: undefined }); }}>{t('search.clear')}</Button>
          <Button onClick={() => setFiltersOpen(false)}>{t('search.showResults', { n: num(data?.total ?? 0) })}</Button></>}>
        {filterPanel}
      </Modal>
    </div>
  );
}

function Filters({ p, set, unis }: { p: Record<string, string>; set: (o: Record<string, string | number | undefined>) => void; unis: any[] }) {
  const t = useT();
  const { num } = useFormat();
  const types = p.category ? TYPES[p.category as keyof typeof TYPES] : [...TYPES.bicycle, ...TYPES.motorcycle];
  const selected = new Set((p.type ?? '').split(',').filter(Boolean));
  const toggleType = (tp: string) => { selected.has(tp) ? selected.delete(tp) : selected.add(tp); set({ type: [...selected].join(',') || undefined }); };
  const startLocal = p.start ? new Date(new Date(p.start).getTime() + 420 * 60000).toISOString() : '';
  const [date, setDate] = useState(startLocal.slice(0, 10));
  const [time, setTime] = useState(startLocal.slice(11, 16) || '09:00');
  const [hours, setHours] = useState(p.start && p.end ? String((new Date(p.end).getTime() - new Date(p.start).getTime()) / 3600000) : '3');
  const applyDates = (d = date, tm = time, h = hours) => {
    if (!d) return set({ start: undefined, end: undefined });
    const s = localToIso(d, tm, 420);
    set({ start: s, end: new Date(new Date(s).getTime() + Number(h) * 3600000).toISOString() });
  };
  return (
    <div className="space-y-7">
      <section>
        <h3 className="label">{t('search.vehicleType')}</h3>
        <div className="flex flex-wrap gap-2">
          {types.map((tp) => <button key={tp} onClick={() => toggleType(tp)} className={cx('chip', selected.has(tp) && 'chip-on')}>{t(`vehicleTypes.${tp}`)}</button>)}
        </div>
      </section>
      <section>
        <h3 className="label">{t('search.availability')}</h3>
        <div className="grid grid-cols-[1fr_7rem_7rem] gap-2">
          <Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDate(e.target.value); applyDates(e.target.value); }} aria-label={t('booking.pickupDate')} />
          <Select value={time} onChange={(e) => { setTime(e.target.value); applyDates(date, e.target.value); }} aria-label={t('booking.pickupTime')}>
            {Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`).map((x) => <option key={x}>{x}</option>)}
          </Select>
          <Select value={hours} onChange={(e) => { setHours(e.target.value); applyDates(date, time, e.target.value); }} aria-label={t('booking.duration')}>
            {['0.5', '1', '2', '3', '6', '12', '24', '48', '72'].map((h) => <option key={h} value={h}>{Number(h) < 1 ? t('units.minutes', { n: num(30) }) : Number(h) >= 24 ? t('units.days', { n: num(Number(h) / 24) }) : t('units.hours', { n: num(Number(h)) })}</option>)}
          </Select>
        </div>
        <p className="mt-1.5 text-xs text-ink-500">{t('search.availabilityHint')}</p>
      </section>
      <section>
        <h3 className="label">{t('search.pricePerHour')}</h3>
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" inputMode="numeric" placeholder={t('search.min')} defaultValue={p.minPrice} onBlur={(e) => set({ minPrice: e.target.value || undefined })} />
          <Input type="number" inputMode="numeric" placeholder={t('search.max')} defaultValue={p.maxPrice} onBlur={(e) => set({ maxPrice: e.target.value || undefined })} />
        </div>
      </section>
      <section>
        <h3 className="label">{t('search.minRating')}</h3>
        <div className="flex flex-wrap gap-2">
          {['', '3', '4', '4.5'].map((r) => <button key={r} onClick={() => set({ minRating: r || undefined })} className={cx('chip', (p.minRating ?? '') === r && 'chip-on')}>
            {r ? <><Icon name="star" size={14} filled className="text-amber-400" />{num(Number(r), 1)}+</> : t('search.any')}</button>)}
        </div>
      </section>
      {unis.length > 0 && (
        <section>
          <h3 className="label">{t('search.university')}</h3>
          <Select value={p.universityId ?? ''} onChange={(e) => set({ universityId: e.target.value || undefined, sort: e.target.value ? 'nearest' : undefined, lat: undefined, lng: undefined })}>
            <option value="">{t('search.anyUniversity')}</option>
            {unis.map((u) => <option key={u.id} value={u.id}>{u.short_name} — {u.name}</option>)}
          </Select>
        </section>
      )}
    </div>
  );
}
