import { useState } from 'react';
import { useT } from '../i18n';
import { Link, navigate, setSearch, useLocation } from '../lib/router';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFormat, localToIso } from '../lib/format';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/Layout';
import { BookingList } from '../components/BookingList';
import { Badge, Button, ButtonLink, Card, DemoBadge, Empty, Field, Input, Modal, Notice, PageLoader, Select, Stat, StatusBadge, Stars, Tabs, useErrorText, useToast } from '../components/ui';

type Tab = 'overview' | 'requests' | 'bookings' | 'vehicles' | 'calendar' | 'earnings';

export function OwnerDashboard() {
  const t = useT();
  const { user } = useAuth();
  const { money, num } = useFormat();
  const { search } = useLocation();
  const tab = (search.get('tab') as Tab) ?? 'overview';
  const bookings = useApi<{ items: any[] }>('/api/bookings?as=owner');
  const vehicles = useApi<{ items: any[] }>('/api/owner/vehicles');
  const earnings = useApi<any>('/api/owner/earnings');

  if (bookings.loading || vehicles.loading || earnings.loading) return <PageLoader />;
  const all = bookings.data?.items ?? [];
  const pending = all.filter((b) => b.status === 'pending');
  const s = earnings.data?.summary ?? {};
  const idVerified = user!.verifications.some((v) => v.type === 'identity' && v.status === 'approved');

  return (
    <div className="container-x py-8 sm:py-10">
      <PageHeader title={t('dashboard.owner.title')} subtitle={t('dashboard.owner.subtitle')}
        actions={<ButtonLink to="/dashboard/owner/vehicles/new" variant="brand" icon="plus">{t('dashboard.owner.addVehicle')}</ButtonLink>} />

      {!idVerified && <div className="mb-6"><Notice tone="info" icon="shield" title={t('dashboard.owner.verifyTitle')} action={<Link to="/account" className="shrink-0 text-sm font-bold text-brand-700 underline">{t('dashboard.verifyCta')}</Link>}>{t('dashboard.owner.verifyBody')}</Notice></div>}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('dashboard.owner.totalEarnings')} value={money(s.total)} icon="wallet" tone="green" hint={t('dashboard.owner.afterFee')} />
        <Stat label={t('dashboard.owner.pendingEarnings')} value={money(s.pending)} icon="clock" tone="amber" hint={t('dashboard.owner.pendingHint')} />
        <Stat label={t('dashboard.owner.activeBookings')} value={num(s.active_bookings ?? 0)} icon="calendar" />
        <Stat label={t('dashboard.owner.completed')} value={num(s.completed_rentals ?? 0)} icon="check" tone="violet" />
      </div>

      <div className="mb-6"><Tabs value={tab} onChange={(v) => setSearch({ tab: v })} items={[
        { value: 'overview', label: t('dashboard.owner.tabs.overview') },
        { value: 'requests', label: t('dashboard.owner.tabs.requests'), count: pending.length },
        { value: 'bookings', label: t('dashboard.owner.tabs.bookings') },
        { value: 'vehicles', label: t('dashboard.owner.tabs.vehicles'), count: vehicles.data?.items.length },
        { value: 'calendar', label: t('dashboard.owner.tabs.calendar') },
        { value: 'earnings', label: t('dashboard.owner.tabs.earnings') },
      ]} /></div>

      {tab === 'overview' && <Overview data={earnings.data} pending={pending} />}
      {tab === 'requests' && <BookingList items={pending} as="owner" emptyTitle={t('dashboard.owner.noRequests')} emptyBody={t('dashboard.owner.noRequestsBody')} />}
      {tab === 'bookings' && <BookingList items={all} as="owner" emptyTitle={t('dashboard.owner.noBookings')} />}
      {tab === 'vehicles' && <Vehicles items={vehicles.data?.items ?? []} reload={vehicles.reload} />}
      {tab === 'calendar' && <Calendar vehicles={vehicles.data?.items ?? []} bookings={all} />}
      {tab === 'earnings' && <Earnings data={earnings.data} />}
    </div>
  );
}

function Overview({ data, pending }: { data: any; pending: any[] }) {
  const t = useT();
  const { money, num } = useFormat();
  const monthly = [...(data?.monthly ?? [])].reverse();
  const max = Math.max(1, ...monthly.map((m: any) => m.net));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-6">
        <div className="flex items-center justify-between"><h3 className="font-bold">{t('dashboard.owner.monthly')}</h3><span className="text-xs text-ink-500">{t('dashboard.owner.net')}</span></div>
        {monthly.length === 0 ? <Empty icon="chart" title={t('dashboard.owner.noEarnings')} /> : (
          <div className="mt-6 flex h-52 items-end gap-3" dir="ltr">
            {monthly.map((m: any) => (
              <div key={m.month} className="group flex flex-1 flex-col items-center gap-2">
                <div className="text-[11px] font-semibold text-ink-600 opacity-0 transition group-hover:opacity-100">{money(m.net)}</div>
                <div className="w-full max-w-12 rounded-t-lg bg-brand-500 transition group-hover:bg-brand-600" style={{ height: `${Math.max(4, (m.net / max) * 160)}px` }} />
                <div className="text-[11px] text-ink-500">{m.month.slice(5)}/{m.month.slice(2, 4)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="font-bold">{t('dashboard.owner.popular')}</h3>
          <div className="mt-4 space-y-3">
            {(data?.popular ?? []).map((v: any, i: number) => (
              <div key={v.id} className="flex items-center gap-3 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold">{num(i + 1)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{v.name}</span>
                <span className="text-ink-500">{t('dashboard.owner.rentals', { n: num(v.rentals) })}</span>
                <span className="font-semibold">{money(v.net)}</span>
              </div>
            ))}
          </div>
        </Card>
        {pending.length > 0 && <Notice tone="warn" title={t('dashboard.owner.pendingRequests', { n: num(pending.length) })} action={<button onClick={() => setSearch({ tab: 'requests' })} className="shrink-0 text-sm font-bold underline">{t('common.view')}</button>}>{t('dashboard.owner.respondSoon')}</Notice>}
      </div>
    </div>
  );
}

function Vehicles({ items, reload }: { items: any[]; reload: () => void }) {
  const t = useT();
  const { money } = useFormat();
  const toast = useToast();
  const errText = useErrorText();
  const setStatus = async (id: number, status: string) => {
    try { await api.patch(`/api/vehicles/${id}`, { status }); toast(t('dashboard.owner.statusUpdated')); reload(); } catch (e) { toast(errText(e), 'error'); }
  };
  if (!items.length) return <Card><Empty icon="bike" title={t('dashboard.owner.noVehicles')} body={t('dashboard.owner.noVehiclesBody')} action={<ButtonLink to="/dashboard/owner/vehicles/new" variant="brand" icon="plus">{t('dashboard.owner.addVehicle')}</ButtonLink>} /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((v) => (
        <Card key={v.id} className="flex gap-4 p-4">
          <Link to={`/vehicles/${v.id}`} className="shrink-0"><img src={v.cover_url ?? ''} alt="" className="h-24 w-32 rounded-xl bg-ink-100 object-cover" /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><Link to={`/vehicles/${v.id}`} className="truncate font-bold hover:underline">{v.name}</Link><StatusBadge status={v.status} />{!!v.is_demo && <DemoBadge />}</div>
            <div className="mt-0.5 text-sm text-ink-500">{t(`vehicleTypes.${v.type}`)} · <Stars value={v.rating_avg} count={v.rating_count} /></div>
            <div className="mt-1 text-sm text-ink-600">{t('dashboard.owner.earnedOn', { amount: money(v.earned) })}</div>
            {v.status === 'pending_review' && <p className="mt-1 text-xs text-amber-700">{t('dashboard.owner.underReview')}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="edit" onClick={() => navigate(`/dashboard/owner/vehicles/${v.id}/edit`)}>{t('common.edit')}</Button>
              {v.status === 'active' && <Button size="sm" variant="ghost" icon="pause" onClick={() => setStatus(v.id, 'paused')}>{t('dashboard.owner.pause')}</Button>}
              {v.status === 'active' && <Button size="sm" variant="ghost" icon="settings" onClick={() => setStatus(v.id, 'maintenance')}>{t('dashboard.owner.maintenance')}</Button>}
              {['paused', 'maintenance'].includes(v.status) && <Button size="sm" variant="ghost" icon="play" onClick={() => setStatus(v.id, 'active')}>{t('dashboard.owner.resume')}</Button>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Calendar({ vehicles, bookings }: { vehicles: any[]; bookings: any[] }) {
  const t = useT();
  const { dateTime } = useFormat();
  const toast = useToast();
  const errText = useErrorText();
  const [vid, setVid] = useState<number | null>(vehicles[0]?.id ?? null);
  const detail = useApi<any>(vid ? `/api/vehicles/${vid}` : null, [vid]);
  const [blockOpen, setBlockOpen] = useState(false);
  const [b, setB] = useState({ from: '', to: '', note: '' });
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  if (!vehicles.length) return <Card><Empty icon="calendar" title={t('dashboard.owner.noVehicles')} /></Card>;
  const offset = detail.data?.vehicle.utc_offset_minutes ?? 420;
  const busy = (detail.data?.busy ?? []) as any[];
  const vb = bookings.filter((x) => x.vehicle_id === vid && ['pending', 'accepted', 'confirmed', 'active'].includes(x.status));
  const addBlock = async () => {
    try {
      await api.post(`/api/vehicles/${vid}/blocks`, { start: localToIso(b.from, '00:00', offset), end: localToIso(b.to, '23:59', offset), note: b.note || undefined });
      toast(t('dashboard.owner.blockAdded')); setBlockOpen(false); detail.reload();
    } catch (e) { toast(errText(e), 'error'); }
  };
  const removeBlock = async (id: number) => { await api.del(`/api/vehicles/${vid}/blocks/${id}`); detail.reload(); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><Field label={t('dashboard.owner.vehicle')}><Select value={vid ?? ''} onChange={(e) => setVid(Number(e.target.value))}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field></div>
        <Button variant="secondary" icon="lock" onClick={() => setBlockOpen(true)}>{t('dashboard.owner.blockDates')}</Button>
        <Button variant="ghost" icon="clock" onClick={() => navigate(`/dashboard/owner/vehicles/${vid}/edit#availability`)}>{t('dashboard.owner.editHours')}</Button>
      </div>
      <Card className="overflow-x-auto p-5">
        <div className="grid min-w-[700px] grid-cols-14 gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {days.map((d) => {
            const dayStart = d.getTime(), dayEnd = dayStart + 86400000;
            const hits = busy.filter((x) => new Date(x.start_at).getTime() < dayEnd && new Date(x.end_at).getTime() > dayStart);
            const blocked = hits.some((h) => h.kind === 'blocked');
            return (
              <div key={dayStart} className={`rounded-xl p-2 text-center ${blocked ? 'bg-amber-50 ring-1 ring-amber-200' : hits.length ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-ink-50'}`}>
                <div className="text-[11px] font-semibold text-ink-500">{t(`weekdays.short.${d.getDay()}`)}</div>
                <div className="text-lg font-bold">{d.getDate()}</div>
                <div className="mt-1 h-4 text-[10px] font-semibold">{blocked ? <span className="text-amber-700">{t('vehicle.busy.blocked')}</span> : hits.length ? <span className="text-brand-700">{hits.length}×</span> : ''}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-4 text-xs text-ink-500"><span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-100 ring-1 ring-brand-200" />{t('vehicle.busy.booked')}</span><span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-200" />{t('vehicle.busy.blocked')}</span></div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <div><h3 className="mb-3 font-bold">{t('dashboard.owner.upcomingForVehicle')}</h3><BookingList items={vb} as="owner" emptyTitle={t('dashboard.owner.noBookings')} /></div>
        <div>
          <h3 className="mb-3 font-bold">{t('dashboard.owner.blocks')}</h3>
          {(detail.data?.blocks ?? []).length === 0 ? <Card><Empty icon="lock" title={t('dashboard.owner.noBlocks')} /></Card> : (
            <Card className="divide-y divide-ink-100">{detail.data.blocks.map((bl: any) => (
              <div key={bl.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><div className="font-semibold">{dateTime(bl.block_start, offset)} → {dateTime(bl.block_end, offset)}</div>{bl.note && <div className="text-xs text-ink-500">{bl.note}</div>}</div>
                <Button size="sm" variant="ghost" icon="trash" onClick={() => removeBlock(bl.id)} aria-label={t('common.delete')} />
              </div>))}
            </Card>
          )}
        </div>
      </div>
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title={t('dashboard.owner.blockDates')} footer={<Button onClick={addBlock} disabled={!b.from || !b.to || b.to < b.from}>{t('common.save')}</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.from')}><Input type="date" value={b.from} onChange={(e) => setB({ ...b, from: e.target.value, to: b.to || e.target.value })} /></Field>
          <Field label={t('common.to')}><Input type="date" value={b.to} min={b.from} onChange={(e) => setB({ ...b, to: e.target.value })} /></Field>
        </div>
        <Field className="mt-4" label={t('common.note')}><Input value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} placeholder={t('dashboard.owner.blockNotePlaceholder')} /></Field>
      </Modal>
    </div>
  );
}

function Earnings({ data }: { data: any }) {
  const t = useT();
  const { money, dateTime } = useFormat();
  const s = data?.summary ?? {};
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t('dashboard.owner.available')} value={money(s.available)} icon="wallet" tone="green" />
        <Stat label={t('dashboard.owner.pendingEarnings')} value={money(s.pending)} icon="clock" tone="amber" />
        <Stat label={t('dashboard.owner.feesPaid')} value={money(s.commission_paid)} icon="chart" />
      </div>
      <Notice tone="info" title={t('dashboard.owner.payoutTitle')}>{t('dashboard.owner.payoutBody')}</Notice>
      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4 font-bold">{t('dashboard.owner.ledger')}</div>
        {(data?.ledger ?? []).length === 0 ? <Empty icon="wallet" title={t('dashboard.owner.noEarnings')} /> : (
          <div className="divide-y divide-ink-100">
            {data.ledger.map((x: any) => (
              <div key={x.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><div className="font-semibold">{t(`ledger.${x.type}`)}</div><div className="text-xs text-ink-500"><span dir="ltr">{x.booking_code}</span> · {dateTime(x.created_at)}</div></div>
                <span className={x.type === 'refund' ? 'font-bold text-red-600' : 'font-bold text-emerald-700'}>{x.type === 'refund' ? '−' : '+'}{money(x.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Badge tone="gray">{t('dashboard.owner.payoutSoon')}</Badge>
    </div>
  );
}
