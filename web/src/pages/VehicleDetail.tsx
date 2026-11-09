import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { Link, navigate } from '../lib/router';
import { useApi, useDebounced } from '../lib/hooks';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFormat, localToIso, isoToLocal, minutesToHHMM, tzLabel } from '../lib/format';
import { Icon } from '../components/icons';
import { Avatar, Badge, Button, Card, DemoBadge, Empty, Modal, Notice, PageLoader, Select, Stars, Textarea, cx, useErrorText, useToast, Input } from '../components/ui';
import { MapView } from '../components/MapView';
import { campusState, CampusAction } from '../components/Campus';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function VehicleDetail({ id }: { id: number }) {
  const t = useT();
  const { money, duration, km, num, relative, date } = useFormat();
  const { user } = useAuth();
  const toast = useToast();
  const errText = useErrorText();
  const { data, loading, error, setData } = useApi<any>(`/api/vehicles/${id}`, [id]);
  const [img, setImg] = useState(0);
  const [bookOpen, setBookOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (loading) return <PageLoader />;
  if (error || !data) return <div className="container-x py-20"><Empty icon="search" title={t('vehicle.notFound')} action={<Link to="/search" className="font-semibold text-brand-600">{t('nav.browse')}</Link>} /></div>;

  const v = data.vehicle;
  const isOwner = user?.id === v.owner_id;
  const toggleSave = async () => {
    if (!user) return navigate(`/login?next=/vehicles/${id}`);
    const r = data.saved ? await api.del(`/api/vehicles/${id}/save`) : await api.post(`/api/vehicles/${id}/save`);
    setData({ ...data, saved: r.saved });
    toast(r.saved ? t('vehicle.saved') : t('vehicle.unsaved'));
  };
  const contact = async () => {
    if (!user) return navigate(`/login?next=/vehicles/${id}`);
    try { const r = await api.post(`/api/vehicles/${id}/contact`); navigate(`/messages/${r.conversationId}`); } catch (e) { toast(errText(e), 'error'); }
  };
  const hours = groupWindows(data.availability);

  return (
    <div className="container-x py-6 sm:py-10">
      <div className="mb-4 flex items-center gap-2 text-sm text-ink-500">
        <Link to="/search" className="hover:text-ink-900">{t('nav.browse')}</Link><Icon name="chevronRight" size={14} />
        <Link to={`/search?category=${v.category}`} className="hover:text-ink-900">{t(`categories.${v.category}`)}</Link><Icon name="chevronRight" size={14} />
        <span className="truncate text-ink-800">{v.name}</span>
      </div>

      {v.status !== 'active' && <div className="mb-4"><Notice tone="warn" title={t(`status.${v.status}`)}>{t('vehicle.notPublic')}</Notice></div>}

      {/* Gallery */}
      <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
        <div className="relative aspect-[16/10] overflow-hidden rounded-3xl lg:aspect-auto lg:h-[460px] bg-ink-100">
          {data.images[img] && <img src={data.images[img].url} alt={v.name} className="h-full w-full animate-fade-in object-cover" key={img} />}
          {!!v.is_demo && <DemoBadge className="absolute start-4 top-4" />}
          {data.images.length > 1 && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
              {data.images.map((_: any, i: number) => <button key={i} onClick={() => setImg(i)} aria-label={`${i + 1}`} className={cx('h-2 rounded-full transition-all', i === img ? 'w-6 bg-white' : 'w-2 bg-white/60')} />)}
            </div>
          )}
        </div>
        <div className="scrollbar-none flex gap-3 overflow-x-auto lg:flex-col">
          {data.images.map((im: any, i: number) => (
            <button key={im.id} onClick={() => setImg(i)} className={cx('aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-2xl ring-2 transition lg:aspect-auto lg:h-[145px] lg:w-full', i === img ? 'ring-brand-500' : 'ring-transparent opacity-80 hover:opacity-100')}>
              <img src={im.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="dark" icon={v.category === 'bicycle' ? 'bike' : 'moto'}>{t(`vehicleTypes.${v.type}`)}</Badge>
            <Badge tone="gray">{t(`conditions.${v.condition}`)}</Badge>
            {!!v.instant_book && <Badge tone="blue" icon="bolt">{t('vehicle.instant')}</Badge>}
            {!!v.students_only && <Badge tone="blue" icon="graduation">{t('campus.badgeFull', { uni: v.university_name })}</Badge>}
            {v.category === 'motorcycle' && <Badge tone="amber" icon="shield">{t('vehicle.licenseRequired')}</Badge>}
          </div>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{v.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
            <Stars value={v.rating_avg} count={v.rating_count} />
            <span className="inline-flex items-center gap-1"><Icon name="pin" size={15} />{v.city_name}{v.university_name && ` · ${v.university_name}`}</span>
            {v.distance_km != null && <span>{km(v.distance_km)}</span>}
            <span>{v.brand} {v.model}{v.year ? ` · ${v.year}` : ''}</span>
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" size="sm" icon="heart" onClick={toggleSave} className={data.saved ? 'text-rose-600' : ''}>{data.saved ? t('vehicle.savedBtn') : t('vehicle.save')}</Button>
            {!isOwner && <Button variant="secondary" size="sm" icon="chat" onClick={contact}>{t('vehicle.askOwner')}</Button>}
            {isOwner && <Button variant="secondary" size="sm" icon="edit" onClick={() => navigate(`/dashboard/owner/vehicles/${id}/edit`)}>{t('common.edit')}</Button>}
          </div>

          {/* Owner */}
          <Card className="mt-8 flex items-center gap-4 p-5">
            <Avatar name={v.owner_name} url={v.owner_avatar} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-bold">{v.owner_name}{v.owner_verified && <Badge tone="green" icon="shield">{t('vehicle.verifiedOwner')}</Badge>}</div>
              <div className="mt-0.5 text-sm text-ink-500">
                {t('vehicle.ownerStats', { n: num(v.owner_completed), since: date(v.owner_since) })}
                {v.owner_rating && <> · <Icon name="star" size={13} filled className="inline text-amber-400" /> {num(v.owner_rating, 1)}</>}
              </div>
            </div>
          </Card>

          <Section title={t('vehicle.about')}><p className="whitespace-pre-line leading-relaxed text-ink-700">{v.description || '—'}</p></Section>

          <Section title={t('vehicle.pricing')}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.pricing.map((p: any) => (
                <div key={p.duration_minutes} className="card p-4">
                  <div className="text-xs font-semibold text-ink-500">{duration(p.duration_minutes)}</div>
                  <div className="mt-1 text-lg font-semibold">{money(p.price)}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink-500">{t('vehicle.pricingHint')}</p>
            {v.deposit > 0 && <p className="mt-2 text-sm text-ink-700"><Icon name="lock" size={15} className="me-1 inline" />{t('vehicle.deposit', { amount: money(v.deposit) })}</p>}
          </Section>

          <Section title={t('vehicle.availability')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Icon name="clock" size={17} />{t('vehicle.handoverHours')} <span className="font-normal text-ink-500">({tzLabel(v.utc_offset_minutes)})</span></div>
                {hours.length === 0 ? <p className="text-sm text-ink-600">{t('vehicle.anytime')}</p> : (
                  <ul className="space-y-1.5 text-sm">{hours.map((h, i) => <li key={i} className="flex justify-between gap-3"><span className="text-ink-500">{h.days.map((d) => t(`weekdays.short.${d}`)).join(', ')}</span><span className="font-semibold" dir="ltr">{h.range}</span></li>)}</ul>
                )}
              </Card>
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Icon name="calendar" size={17} />{t('vehicle.upcomingBusy')}</div>
                {data.busy.length === 0 ? <p className="text-sm text-emerald-700">{t('vehicle.noBusy')}</p> : (
                  <ul className="space-y-1.5 text-sm">{data.busy.slice(0, 6).map((b: any, i: number) => <BusyRow key={i} b={b} offset={v.utc_offset_minutes} />)}</ul>
                )}
              </Card>
            </div>
          </Section>

          <Section title={t('vehicle.rules')}>
            <ul className="space-y-2 text-ink-700">
              {(v.rules || '').split(/\.\s+/).filter(Boolean).map((r: string, i: number) => <li key={i} className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 text-emerald-500" />{r.replace(/\.$/, '')}</li>)}
            </ul>
            <p className="mt-4 text-sm text-ink-500">{t('vehicle.agreementNote')} <Link to="/terms" className="font-semibold text-brand-600 hover:underline">{t('vehicle.readAgreement')}</Link></p>
          </Section>

          <Section title={t('vehicle.location')}>
            <p className="mb-3 flex items-center gap-1.5 text-sm text-ink-600"><Icon name="pin" size={16} />{v.pickup_address}</p>
            <MapView points={[{ id: v.id, lat: v.lat, lng: v.lng, label: t(`categories.${v.category}`) }]} single className="h-72 w-full rounded-2xl" />
            <p className="mt-2 text-xs text-ink-500">{t('vehicle.exactLocation')}</p>
          </Section>

          <Section title={t('vehicle.reviews', { n: num(data.reviews.length) })}>
            {data.reviews.length === 0 ? <p className="text-sm text-ink-500">{t('vehicle.noReviews')}</p> : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.reviews.map((r: any) => (
                  <Card key={r.id} className="p-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.author_name} url={r.author_avatar} size={36} />
                      <div className="min-w-0 flex-1"><div className="text-sm font-bold">{r.author_name}</div><div className="text-xs text-ink-500">{relative(r.created_at)}</div></div>
                      {!!r.is_demo && <DemoBadge />}
                    </div>
                    <div className="mt-3 flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Icon key={s} name="star" size={14} filled={s <= r.rating} className={s <= r.rating ? 'text-amber-400' : 'text-ink-200'} />)}</div>
                    {r.comment && <p className="mt-2 text-sm text-ink-700">{r.comment}</p>}
                  </Card>
                ))}
              </div>
            )}
          </Section>

          {user && !isOwner && <button onClick={() => setReportOpen(true)} className="mt-10 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-red-600"><Icon name="flag" size={15} />{t('report.listing')}</button>}
        </div>

        {/* Booking widget */}
        <div className="hidden lg:block">
          <div className="sticky top-24"><BookingWidget data={data} /></div>
        </div>
      </div>

      {/* Mobile booking bar */}
      <div className="fixed inset-x-0 bottom-0 z-[400] border-t border-ink-900/5 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            {data.pricing[0] && <div><span className="text-lg font-semibold">{money(data.pricing[0].price)}</span><span className="text-sm text-ink-500"> / {duration(data.pricing[0].duration_minutes)}</span></div>}
            <div className="text-xs text-ink-500">{t('vehicle.flexible')}</div>
          </div>
          <Button variant="brand" onClick={() => setBookOpen(true)} disabled={isOwner}>{t('booking.checkAvailability')}</Button>
        </div>
      </div>
      <div className="h-20 lg:hidden" />
      <Modal open={bookOpen} onClose={() => setBookOpen(false)} title={t('booking.title')}><BookingWidget data={data} bare /></Modal>
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} targetType="vehicle" targetId={v.id} />
    </div>
  );
}

function BusyRow({ b, offset }: { b: any; offset: number }) {
  const t = useT();
  const { dateTime } = useFormat();
  return <li className="flex justify-between gap-3"><span className="text-ink-700">{dateTime(b.start_at, offset)} → {dateTime(b.end_at, offset)}</span>
    <Badge tone={b.kind === 'booked' ? 'gray' : 'amber'}>{t(`vehicle.busy.${b.kind}`)}</Badge></li>;
}

function groupWindows(rows: { weekday: number; start_minute: number; end_minute: number }[]) {
  const byRange = new Map<string, number[]>();
  for (const r of rows) {
    const k = `${minutesToHHMM(r.start_minute)}–${minutesToHHMM(r.end_minute)}`;
    byRange.set(k, [...(byRange.get(k) ?? []), r.weekday]);
  }
  return [...byRange.entries()].map(([range, days]) => ({ range, days: days.sort() }));
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-10 border-t border-ink-900/5 pt-8"><h2 className="mb-4 text-xl font-bold">{title}</h2>{children}</section>
);

/** Booking widget: choose pickup + duration → live availability & price from the server → request. */
function BookingWidget({ data, bare }: { data: any; bare?: boolean }) {
  const t = useT();
  const { money, duration, dateTime, num } = useFormat();
  const { user } = useAuth();
  const errText = useErrorText();
  const v = data.vehicle;
  const offset = v.utc_offset_minutes;
  const tiers: number[] = data.pricing.map((p: any) => p.duration_minutes);
  const isOwner = user?.id === v.owner_id;

  // Default pickup: next full hour inside today's/tomorrow's opening window.
  const initial = useMemo(() => {
    const now = new Date(Math.ceil((Date.now() + 30 * 60000) / 1800000) * 1800000);
    return isoToLocal(now.toISOString(), offset);
  }, [offset]);
  const [pDate, setPDate] = useState(initial.date);
  const [pTime, setPTime] = useState(initial.time);
  const [mins, setMins] = useState<number>(tiers.includes(60) ? 60 : tiers[0] ?? 60);
  const [custom, setCustom] = useState(false);
  const [rDate, setRDate] = useState(initial.date);
  const [rTime, setRTime] = useState(initial.time);
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = localToIso(pDate, pTime, offset);
  const end = custom ? localToIso(rDate, rTime, offset) : new Date(new Date(start).getTime() + mins * 60000).toISOString();
  const key = useDebounced(`${start}|${end}`, 250);

  useEffect(() => {
    if (end <= start) { setQuote({ available: false, problem: 'END_BEFORE_START' }); return; }
    let alive = true;
    setChecking(true);
    api.get(`/api/vehicles/${v.id}/quote` + qs({ start, end })).then((q) => alive && setQuote(q)).catch(() => alive && setQuote(null)).finally(() => alive && setChecking(false));
    return () => { alive = false; };
  }, [key]);

  const eligibleBlock = v.category === 'motorcycle' && user && !user.eligibility.motorcycle;
  const campus = v.students_only ? campusState(user, v.university_id) : 'ok';
  const campusBlock = !!user && campus !== 'ok';
  const submit = async () => {
    if (!user) return navigate(`/login?next=/vehicles/${v.id}`);
    setSubmitting(true); setErr(null);
    try {
      const r = await api.post('/api/bookings', { vehicleId: v.id, start, end, note: note || undefined, acceptAgreement: agree });
      navigate(`/bookings/${r.booking.id}`);
    } catch (e) { setErr(errText(e)); } finally { setSubmitting(false); }
  };
  const slots = Array.from({ length: 48 }, (_, i) => minutesToHHMM(i * 30));

  return (
    <div className={bare ? '' : 'card p-6'}>
      {!bare && <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{t('booking.title')}</h2>
        <span className="text-xs text-ink-500">{t('booking.timesIn', { tz: tzLabel(offset) })}</span>
      </div>}

      <div className="space-y-4">
        <div>
          <span className="label">{t('booking.pickup')}</span>
          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <Input type="date" value={pDate} min={initial.date} onChange={(e) => { setPDate(e.target.value); if (rDate < e.target.value) setRDate(e.target.value); }} aria-label={t('booking.pickupDate')} />
            <Select value={pTime} onChange={(e) => setPTime(e.target.value)} aria-label={t('booking.pickupTime')}>{slots.map((s) => <option key={s}>{s}</option>)}</Select>
          </div>
        </div>
        <div>
          <span className="label">{t('booking.duration')}</span>
          <div className="flex flex-wrap gap-2">
            {tiers.map((m) => <button key={m} onClick={() => { setMins(m); setCustom(false); }} className={cx('chip h-8 px-3 text-[13px]', !custom && mins === m && 'chip-on')}>{duration(m)}</button>)}
            {!tiers.includes(1440 * 2) && <button onClick={() => { setMins(2880); setCustom(false); }} className={cx('chip h-8 px-3 text-[13px]', !custom && mins === 2880 && 'chip-on')}>{duration(2880)}</button>}
            <button onClick={() => setCustom(true)} className={cx('chip h-8 px-3 text-[13px]', custom && 'chip-on')}>{t('booking.custom')}</button>
          </div>
        </div>
        {custom && (
          <div>
            <span className="label">{t('booking.return')}</span>
            <div className="grid grid-cols-[1fr_6.5rem] gap-2">
              <Input type="date" value={rDate} min={pDate} onChange={(e) => setRDate(e.target.value)} aria-label={t('booking.returnDate')} />
              <Select value={rTime} onChange={(e) => setRTime(e.target.value)} aria-label={t('booking.returnTime')}>{slots.map((s) => <option key={s}>{s}</option>)}</Select>
            </div>
          </div>
        )}
        <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm">
          <div className="flex justify-between gap-2"><span className="text-ink-500">{t('booking.pickup')}</span><span className="font-semibold">{dateTime(start, offset)}</span></div>
          <div className="mt-1 flex justify-between gap-2"><span className="text-ink-500">{t('booking.return')}</span><span className="font-semibold">{end > start ? dateTime(end, offset) : '—'}</span></div>
        </div>
      </div>

      {/* Availability + price */}
      <div className="mt-5">
        {checking && !quote ? <div className="h-24 animate-pulse rounded-xl bg-ink-100" /> : quote && (
          quote.available ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-600"><Icon name="check" size={16} />{t('booking.available')}</div>
              {quote.quote.lines.map((l: any) => (
                <div key={l.duration_minutes} className="flex justify-between text-ink-600"><span>{num(l.qty)} × {duration(l.duration_minutes)} ({money(l.price)})</span><span>{money(l.price * l.qty)}</span></div>
              ))}
              {quote.quote.billedMinutes > quote.quote.minutes && <div className="text-xs text-ink-500">{t('booking.roundedUp', { d: duration(quote.quote.billedMinutes) })}</div>}
              {quote.deposit > 0 && <div className="flex justify-between text-ink-600"><span>{t('booking.depositRefundable')}</span><span>{money(quote.deposit)}</span></div>}
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold"><span>{t('booking.total')}</span><span>{money(quote.total)}</span></div>
            </div>
          ) : <Notice tone="warn">{t(`availability.${quote.problem}`)}</Notice>
        )}
      </div>

      {eligibleBlock && (
        <div className="mt-4"><Notice tone="warn" title={t('eligibility.title')} action={<Link to="/account" className="shrink-0 text-sm font-bold underline">{t('eligibility.fix')}</Link>}>
          {t('eligibility.missing')}: {user!.eligibility.missing.map((m) => t(`eligibility.items.${m}`, { age: user!.eligibility.minAge })).join(', ')}
        </Notice></div>
      )}

      {!!v.students_only && !isOwner && (
        <div className={cx('mt-4 rounded-[18px] p-4', campus === 'ok' ? 'bg-emerald-50' : 'field')}>
          <div className="flex items-center gap-2 text-sm font-black text-ink-950"><Icon name="graduation" size={17} className="text-brand-600" />{t('campus.panelTitle', { uni: v.university_name })}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{t('campus.panelBody')}</p>
          <CampusAction state={campus} next={`/vehicles/${v.id}`} />
        </div>
      )}

      {quote?.available && !isOwner && (
        <div className="mt-5 space-y-3">
          <Textarea rows={2} placeholder={t('booking.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <label className="flex items-start gap-2.5 text-sm text-ink-700">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
            <span>{t('booking.agree')} <Link to="/terms" target="_blank" className="font-semibold text-brand-600 underline">{t('booking.agreementLink')}</Link></span>
          </label>
        </div>
      )}
      {err && <div className="mt-4"><Notice tone="error">{err}</Notice></div>}
      <Button variant="brand" size="lg" className="mt-5 w-full" loading={submitting} onClick={submit}
        disabled={isOwner || !quote?.available || (!!user && !agree) || !!eligibleBlock || campusBlock}>
        {isOwner ? t('booking.yourVehicle') : !user ? t('booking.loginToBook') : v.instant_book ? t('booking.bookInstant') : t('booking.request')}
      </Button>
      <p className="mt-3 text-center text-xs text-ink-500">{v.instant_book ? t('booking.instantHint') : t('booking.requestHint')}</p>
    </div>
  );
}

export function ReportModal({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: string; targetId: number }) {
  const t = useT();
  const toast = useToast();
  const errText = useErrorText();
  const [reason, setReason] = useState('inaccurate');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.post('/api/reports', { targetType, targetId, reason, details: details || undefined }); toast(t('report.sent')); onClose(); }
    catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('report.title')} footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={send}>{t('report.submit')}</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {['fraud', 'unsafe', 'inaccurate', 'harassment', 'damage', 'other'].map((r) => <button key={r} onClick={() => setReason(r)} className={cx('chip', reason === r && 'chip-on')}>{t(`report.reasons.${r}`)}</button>)}
        </div>
        <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('report.detailsPlaceholder')} />
      </div>
    </Modal>
  );
}

export { WEEKDAYS };
