import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { navigate } from '../lib/router';
import { useApi } from '../lib/hooks';
import { api, fileToDataUrl, ApiError } from '../lib/api';
import { useFormat, minutesToHHMM } from '../lib/format';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/Layout';
import { Button, Card, Field, Input, Notice, PageLoader, Select, Textarea, Toggle, cx, useErrorText, useFieldErrors, useToast } from '../components/ui';

const TYPES = { bicycle: ['city', 'mountain', 'road', 'folding', 'electric_bicycle', 'student'], motorcycle: ['scooter', 'automatic', 'manual', 'electric_motorcycle'] };
const TIERS = [30, 60, 120, 180, 360, 720, 1440];
const SUGGEST: Record<string, Record<number, number>> = {
  bicycle: { 30: 5000, 60: 8000, 120: 14000, 180: 20000, 360: 35000, 720: 50000, 1440: 60000 },
  motorcycle: { 360: 50000, 720: 70000, 1440: 90000 },
};
type Win = { weekday: number; startMinute: number; endMinute: number };

export function VehicleForm({ id }: { id?: number }) {
  const t = useT();
  const { duration, money } = useFormat();
  const toast = useToast();
  const errText = useErrorText();
  const fieldErrors = useFieldErrors();
  const editing = !!id;
  const existing = useApi<any>(id ? `/api/vehicles/${id}` : null, [id]);
  const { data: cities } = useApi<{ items: any[] }>('/api/locations/cities');

  const [f, setF] = useState<any>({ category: 'bicycle', type: 'city', name: '', brand: '', model: '', year: '', description: '', condition: 'good', rules: '',
    deposit: '0', cityId: '', universityId: '', pickupAddress: '', lat: '', lng: '', plateNumber: '', insuranceNote: '', instantBook: false });
  const [prices, setPrices] = useState<Record<number, string>>({ 30: '5000', 60: '8000', 180: '20000', 1440: '60000' });
  const [anytime, setAnytime] = useState(false);
  const [sameDaily, setSameDaily] = useState(true);
  const [windows, setWindows] = useState<Win[]>([0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, startMinute: 420, endMinute: 1260 })));
  const [images, setImages] = useState<string[]>([]);
  const [regDoc, setRegDoc] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: unis } = useApi<{ items: any[] }>(f.cityId ? `/api/universities?cityId=${f.cityId}` : null, [f.cityId]);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    const v = d.vehicle;
    setF({ category: v.category, type: v.type, name: v.name, brand: v.brand, model: v.model, year: v.year ?? '', description: v.description, condition: v.condition,
      rules: v.rules, deposit: String(v.deposit), cityId: String(v.city_id), universityId: v.university_id ? String(v.university_id) : '', pickupAddress: v.pickup_address,
      lat: String(v.lat), lng: String(v.lng), plateNumber: v.plate_number ?? '', insuranceNote: v.insurance_note ?? '', instantBook: !!v.instant_book });
    setPrices(Object.fromEntries(d.pricing.map((p: any) => [p.duration_minutes, String(p.price)])));
    setAnytime(d.availability.length === 0);
    if (d.availability.length) setWindows(d.availability.map((w: any) => ({ weekday: w.weekday, startMinute: w.start_minute, endMinute: w.end_minute })));
    setSameDaily(new Set(d.availability.map((w: any) => `${w.start_minute}-${w.end_minute}`)).size <= 1 && d.availability.length === 7);
    if (window.location.hash === '#availability') setTimeout(() => document.getElementById('availability')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [existing.data]);

  const up = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setCategory = (c: 'bicycle' | 'motorcycle') => {
    setF({ ...f, category: c, type: TYPES[c][0] });
    if (!editing) setPrices(Object.fromEntries(Object.entries(SUGGEST[c]).filter(([d]) => c === 'motorcycle' || ['30', '60', '180', '1440'].includes(d)).map(([d, p]) => [d, String(p)])));
  };
  const useMyLocation = () => navigator.geolocation?.getCurrentPosition((p) => setF((x: any) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })));
  const fillFromUniversity = (uid: string) => {
    const u = unis?.items.find((x) => String(x.id) === uid);
    setF((x: any) => ({ ...x, universityId: uid, ...(u && !x.lat ? { lat: String(u.lat), lng: String(u.lng) } : {}) }));
  };
  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const urls = await Promise.all([...files].slice(0, 8 - images.length).map((file) => fileToDataUrl(file)));
    setImages([...images, ...urls]);
  };
  const pricing = Object.entries(prices).filter(([, p]) => p && Number(p) > 0).map(([d, p]) => ({ durationMinutes: Number(d), price: Number(p) }));
  const availability = anytime ? [] : sameDaily ? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ ...windows[0], weekday: d })) : windows;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 3) e.name = t('validation.V_TOO_SHORT');
    if (!f.brand.trim()) e.brand = t('validation.V_REQUIRED');
    if (!f.model.trim()) e.model = t('validation.V_REQUIRED');
    if (!f.cityId) e.cityId = t('validation.V_REQUIRED');
    if (f.pickupAddress.trim().length < 5) e.pickupAddress = t('validation.V_TOO_SHORT');
    if (!f.lat || !f.lng) e.lat = t('vehicleForm.locationRequired');
    if (!pricing.length) e.pricing = t('vehicleForm.priceRequired');
    if (!editing && !images.length) e.images = t('vehicleForm.photoRequired');
    if (!editing && f.category === 'motorcycle' && (!f.plateNumber || !regDoc)) e.registrationDoc = t('vehicleForm.stnkRequired');
    setErrors(e);
    if (Object.keys(e).length) { setErr(t('vehicleForm.fixErrors')); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setBusy(true); setErr(null);
    const body = { ...f, year: f.year ? Number(f.year) : undefined, deposit: Number(f.deposit || 0), cityId: Number(f.cityId), universityId: f.universityId ? Number(f.universityId) : null,
      lat: Number(f.lat), lng: Number(f.lng), plateNumber: f.plateNumber || undefined, insuranceNote: f.insuranceNote || undefined };
    try {
      if (editing) {
        const { category, plateNumber, ...patch } = body;
        void category; void plateNumber;
        await api.patch(`/api/vehicles/${id}`, patch);
        await api.put(`/api/vehicles/${id}/pricing`, { pricing });
        await api.put(`/api/vehicles/${id}/availability`, { availability });
        for (const img of images) await api.post(`/api/vehicles/${id}/images`, { image: img });
        toast(t('vehicleForm.saved'));
        navigate('/dashboard/owner?tab=vehicles');
      } else {
        const r = await api.post('/api/vehicles', { ...body, pricing, availability, images, registrationDoc: regDoc ?? undefined });
        toast(r.listingStatus === 'active' ? t('vehicleForm.published') : t('vehicleForm.submittedForReview'));
        navigate(`/vehicles/${r.id}`);
      }
    } catch (ex) {
      setErrors(fieldErrors(ex));
      setErr(ex instanceof ApiError && ex.code === 'VALIDATION_FAILED' ? t('vehicleForm.fixErrors') : errText(ex));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(false); }
  };
  const removeExisting = async (imageId: number) => { await api.del(`/api/vehicles/${id}/images/${imageId}`); existing.reload(); };

  if (editing && existing.loading) return <PageLoader />;
  const slots = Array.from({ length: 49 }, (_, i) => i * 30);

  return (
    <div className="container-x max-w-4xl py-8 sm:py-10">
      <PageHeader back={{ to: '/dashboard/owner?tab=vehicles', label: t('nav.ownerDashboard') }} title={editing ? t('vehicleForm.editTitle') : t('vehicleForm.title')} subtitle={t('vehicleForm.subtitle')} />
      {err && <div className="mb-6"><Notice tone="error">{err}</Notice></div>}

      <div className="space-y-6">
        <FormCard n={1} title={t('vehicleForm.category')}>
          <div className="grid grid-cols-2 gap-3">
            {(['bicycle', 'motorcycle'] as const).map((c) => (
              <button key={c} type="button" disabled={editing} onClick={() => setCategory(c)}
                className={cx('flex items-center gap-3 rounded-2xl p-4 text-start ring-1 transition disabled:cursor-not-allowed', f.category === c ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white ring-transparent shadow-[0_8px_20px_-8px_rgb(43_118_255/0.6)]' : 'bg-white ring-ink-200 hover:ring-ink-300')}>
                <Icon name={c === 'bicycle' ? 'bike' : 'moto'} size={26} /><span className="font-bold">{t(`categories.${c}`)}</span>
              </button>
            ))}
          </div>
          {f.category === 'motorcycle' && <div className="mt-4"><Notice tone="warn" icon="shield">{t('vehicleForm.motoNotice')}</Notice></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {TYPES[f.category as 'bicycle'].map((tp) => <button key={tp} type="button" onClick={() => setF({ ...f, type: tp })} className={cx('chip', f.type === tp && 'chip-on')}>{t(`vehicleTypes.${tp}`)}</button>)}
          </div>
        </FormCard>

        <FormCard n={2} title={t('vehicleForm.details')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label={t('vehicleForm.name')} error={errors.name} hint={t('vehicleForm.nameHint')}><Input value={f.name} onChange={up('name')} maxLength={80} /></Field>
            <Field label={t('vehicleForm.brand')} error={errors.brand}><Input value={f.brand} onChange={up('brand')} placeholder="Polygon, Honda…" /></Field>
            <Field label={t('vehicleForm.model')} error={errors.model}><Input value={f.model} onChange={up('model')} /></Field>
            <Field label={t('vehicleForm.year')}><Input type="number" inputMode="numeric" value={f.year} onChange={up('year')} /></Field>
            <Field label={t('vehicleForm.condition')}><Select value={f.condition} onChange={up('condition')}>{['new', 'excellent', 'good', 'fair'].map((c) => <option key={c} value={c}>{t(`conditions.${c}`)}</option>)}</Select></Field>
            <Field className="sm:col-span-2" label={t('vehicleForm.description')}><Textarea rows={4} value={f.description} onChange={up('description')} placeholder={t('vehicleForm.descriptionPlaceholder')} maxLength={2000} /></Field>
            <Field className="sm:col-span-2" label={t('vehicleForm.rules')}><Textarea rows={3} value={f.rules} onChange={up('rules')} placeholder={t('vehicleForm.rulesPlaceholder')} maxLength={1000} /></Field>
          </div>
        </FormCard>

        <FormCard n={3} title={t('vehicleForm.photos')}>
          {editing && existing.data?.images.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-3">{existing.data.images.map((im: any) => (
              <div key={im.id} className="relative"><img src={im.url} alt="" className="h-24 w-32 rounded-xl object-cover" />
                <button onClick={() => removeExisting(im.id)} className="absolute -end-2 -top-2 rounded-full bg-white p-1 shadow ring-1 ring-ink-200" aria-label={t('common.delete')}><Icon name="x" size={14} /></button></div>))}</div>
          )}
          <div className="flex flex-wrap gap-3">
            {images.map((src, i) => (
              <div key={i} className="relative"><img src={src} alt="" className="h-24 w-32 rounded-xl object-cover" />
                <button onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute -end-2 -top-2 rounded-full bg-white p-1 shadow ring-1 ring-ink-200" aria-label={t('common.delete')}><Icon name="x" size={14} /></button></div>
            ))}
            {images.length < 8 && (
              <label className="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 text-ink-500 transition hover:border-brand-400 hover:text-brand-600">
                <Icon name="camera" /><span className="text-xs font-semibold">{t('vehicleForm.addPhotos')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => addImages(e.target.files)} />
              </label>
            )}
          </div>
          <p className={cx('mt-2 text-xs', errors.images ? 'font-semibold text-red-600' : 'text-ink-500')}>{errors.images ?? t('vehicleForm.photosHint')}</p>
        </FormCard>

        <FormCard n={4} title={t('vehicleForm.location')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.city')} error={errors.cityId}><Select value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value, universityId: '' })}>
              <option value="">{t('common.select')}</option>{cities?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={t('vehicleForm.nearUniversity')}><Select value={f.universityId} disabled={!f.cityId} onChange={(e) => fillFromUniversity(e.target.value)}>
              <option value="">{t('common.optional')}</option>{unis?.items.map((u) => <option key={u.id} value={u.id}>{u.short_name} — {u.name}</option>)}</Select></Field>
            <Field className="sm:col-span-2" label={t('vehicleForm.pickupAddress')} error={errors.pickupAddress} hint={t('vehicleForm.pickupHint')}><Input value={f.pickupAddress} onChange={up('pickupAddress')} /></Field>
            <Field label={t('vehicleForm.lat')} error={errors.lat}><Input dir="ltr" inputMode="decimal" value={f.lat} onChange={up('lat')} placeholder="-8.6500" /></Field>
            <Field label={t('vehicleForm.lng')}><Input dir="ltr" inputMode="decimal" value={f.lng} onChange={up('lng')} placeholder="115.2167" /></Field>
          </div>
          <Button type="button" variant="secondary" size="sm" icon="locate" className="mt-3" onClick={useMyLocation}>{t('vehicleForm.useMyLocation')}</Button>
        </FormCard>

        <FormCard n={5} title={t('vehicleForm.pricing')}>
          <p className="mb-4 text-sm text-ink-500">{t('vehicleForm.pricingHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TIERS.map((d) => {
              const on = prices[d] !== undefined;
              return (
                <div key={d} className={cx('flex items-center gap-3 rounded-xl p-3 ring-1', on ? 'bg-white ring-ink-200' : 'bg-ink-50 ring-transparent')}>
                  <Toggle checked={on} onChange={(v) => { const n = { ...prices }; if (v) n[d] = String(SUGGEST[f.category][d] ?? ''); else delete n[d]; setPrices(n); }} />
                  <span className="w-20 text-sm font-semibold">{duration(d)}</span>
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">Rp</span>
                    <Input type="number" inputMode="numeric" disabled={!on} value={prices[d] ?? ''} onChange={(e) => setPrices({ ...prices, [d]: e.target.value })} className="h-10 ps-10" />
                  </div>
                </div>
              );
            })}
          </div>
          {errors.pricing && <p className="mt-2 text-sm font-semibold text-red-600">{errors.pricing}</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={t('vehicleForm.deposit')} hint={t('vehicleForm.depositHint')}><Input type="number" inputMode="numeric" value={f.deposit} onChange={up('deposit')} /></Field>
            <div className="flex items-end pb-2"><Toggle checked={f.instantBook} onChange={(v) => setF({ ...f, instantBook: v })} label={<span>{t('vehicleForm.instantBook')}<span className="block text-xs font-normal text-ink-500">{t('vehicleForm.instantBookHint')}</span></span>} /></div>
          </div>
          {pricing.length > 0 && <p className="mt-4 text-sm text-ink-600">{t('vehicleForm.youReceive', { amount: money(Math.round(pricing[0].price * 0.9)), d: duration(pricing[0].durationMinutes) })}</p>}
        </FormCard>

        <div id="availability"><FormCard n={6} title={t('vehicleForm.availability')}>
          <p className="mb-4 text-sm text-ink-500">{t('vehicleForm.availabilityHint')}</p>
          <div className="flex flex-wrap gap-6">
            <Toggle checked={anytime} onChange={setAnytime} label={t('vehicleForm.anytime')} />
            {!anytime && <Toggle checked={sameDaily} onChange={setSameDaily} label={t('vehicleForm.sameEveryDay')} />}
          </div>
          {!anytime && (
            <div className="mt-5 space-y-2">
              {(sameDaily ? [windows[0]] : windows).map((w, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3">
                  <span className="w-28 text-sm font-semibold">{sameDaily ? t('vehicleForm.everyDay') : t(`weekdays.long.${w.weekday}`)}</span>
                  <div className="w-28"><Select value={w.startMinute} onChange={(e) => setWindows(windows.map((x, j) => (sameDaily || j === i ? { ...x, startMinute: Number(e.target.value) } : x)))} className="h-10">
                    {slots.slice(0, 48).map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}</Select></div>
                  <span className="text-ink-400">–</span>
                  <div className="w-28"><Select value={w.endMinute} onChange={(e) => setWindows(windows.map((x, j) => (sameDaily || j === i ? { ...x, endMinute: Number(e.target.value) } : x)))} className="h-10">
                    {slots.slice(1).map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}</Select></div>
                </div>
              ))}
            </div>
          )}
        </FormCard></div>

        {f.category === 'motorcycle' && (
          <FormCard n={7} title={t('vehicleForm.documents')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('vehicleForm.plate')} hint={t('vehicleForm.plateHint')}><Input dir="ltr" value={f.plateNumber} onChange={up('plateNumber')} disabled={editing} placeholder="AB 1234 XY" /></Field>
              <Field label={t('vehicleForm.insurance')}><Input value={f.insuranceNote} onChange={up('insuranceNote')} placeholder={t('vehicleForm.insurancePlaceholder')} /></Field>
            </div>
            {!editing && (
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-ink-200 p-4 hover:border-brand-400">
                <Icon name="document" /><span className="flex-1 text-sm"><b>{t('vehicleForm.stnk')}</b><span className="block text-xs text-ink-500">{regDoc ? t('vehicleForm.fileReady') : t('vehicleForm.stnkHint')}</span></span>
                {regDoc && <Icon name="check" className="text-emerald-600" />}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => e.target.files?.[0] && setRegDoc(await fileToDataUrl(e.target.files[0]))} />
              </label>
            )}
            {errors.registrationDoc && <p className="mt-2 text-sm font-semibold text-red-600">{errors.registrationDoc}</p>}
          </FormCard>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate('/dashboard/owner?tab=vehicles')}>{t('common.cancel')}</Button>
          <Button variant="brand" size="lg" loading={busy} onClick={submit}>{editing ? t('common.saveChanges') : f.category === 'motorcycle' ? t('vehicleForm.submitReview') : t('vehicleForm.publish')}</Button>
        </div>
      </div>
    </div>
  );
}

function FormCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { num } = useFormat();
  return (
    <Card className="p-6 sm:p-7">
      <h2 className="mb-5 flex items-center gap-3 text-lg font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-600">{num(n)}</span>{title}</h2>
      {children}
    </Card>
  );
}
