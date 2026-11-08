import { useState } from 'react';
import { useT } from '../i18n';
import { Link, setSearch, useLocation } from '../lib/router';
import { useApi } from '../lib/hooks';
import { api, qs } from '../lib/api';
import { useFormat } from '../lib/format';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Card, DemoBadge, Empty, Field, Input, Modal, Notice, PageLoader, Select, Stat, StatusBadge, Tabs, Textarea, useErrorText, useToast } from '../components/ui';

type Tab = 'overview' | 'verifications' | 'users' | 'vehicles' | 'bookings' | 'finance' | 'reports' | 'cities' | 'settings';

export function Admin() {
  const t = useT();
  const { search } = useLocation();
  const tab = (search.get('tab') as Tab) ?? 'overview';
  const overview = useApi<any>('/api/admin/overview');
  const c = overview.data?.counts;
  return (
    <div className="container-x py-8 sm:py-10">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <div className="mb-6"><Tabs value={tab} onChange={(v) => setSearch({ tab: v })} items={[
        { value: 'overview', label: t('admin.tabs.overview') },
        { value: 'verifications', label: t('admin.tabs.verifications'), count: c?.pending_verifications },
        { value: 'users', label: t('admin.tabs.users') },
        { value: 'vehicles', label: t('admin.tabs.vehicles'), count: c?.pending_vehicles },
        { value: 'bookings', label: t('admin.tabs.bookings') },
        { value: 'finance', label: t('admin.tabs.finance') },
        { value: 'reports', label: t('admin.tabs.reports'), count: (c?.open_reports ?? 0) + (c?.open_disputes ?? 0) },
        { value: 'cities', label: t('admin.tabs.cities') },
        { value: 'settings', label: t('admin.tabs.settings') },
      ]} /></div>
      {tab === 'overview' && (overview.data ? <Overview data={overview.data} /> : <PageLoader />)}
      {tab === 'verifications' && <Verifications onChange={overview.reload} />}
      {tab === 'users' && <Users />}
      {tab === 'vehicles' && <Vehicles onChange={overview.reload} />}
      {tab === 'bookings' && <Bookings />}
      {tab === 'finance' && <Finance />}
      {tab === 'reports' && <Reports onChange={overview.reload} />}
      {tab === 'cities' && <Cities />}
      {tab === 'settings' && <Settings />}
    </div>
  );
}

function Overview({ data }: { data: any }) {
  const t = useT();
  const { money, num } = useFormat();
  const c = data.counts;
  const max = Math.max(1, ...data.daily.map((d: any) => d.bookings));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('admin.stats.users')} value={num(c.users)} icon="users" hint={t('admin.stats.owners', { n: num(c.owners) })} />
        <Stat label={t('admin.stats.vehicles')} value={num(c.active_vehicles)} icon="bike" tone="violet" hint={t('admin.stats.pendingReview', { n: num(c.pending_vehicles) })} />
        <Stat label={t('admin.stats.gmv')} value={money(c.gmv)} icon="wallet" tone="green" hint={t('admin.stats.demoMoney')} />
        <Stat label={t('admin.stats.commission')} value={money(c.commission)} icon="chart" tone="amber" hint={t('admin.stats.refunds', { amount: money(c.refunds) })} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('admin.stats.bookings')} value={num(c.bookings)} icon="calendar" />
        <Stat label={t('admin.stats.active')} value={num(c.active_rentals)} icon="play" tone="green" />
        <Stat label={t('admin.stats.verifications')} value={num(c.pending_verifications)} icon="shield" tone="amber" />
        <Stat label={t('admin.stats.issues')} value={num(c.open_reports + c.open_disputes)} icon="flag" tone="violet" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <h3 className="font-bold">{t('admin.daily')}</h3>
          <div className="mt-6 flex h-44 items-end gap-1" dir="ltr">
            {data.daily.map((d: any) => <div key={d.day} title={`${d.day}: ${d.bookings}`} className="flex-1 rounded-t bg-brand-500/80 hover:bg-brand-600" style={{ height: `${Math.max(3, (d.bookings / max) * 170)}px` }} />)}
          </div>
          {data.daily.length === 0 && <Empty icon="chart" title={t('admin.noData')} />}
        </Card>
        <Card className="p-6">
          <h3 className="font-bold">{t('admin.byCity')}</h3>
          <table className="mt-4 w-full text-sm"><tbody>
            {data.byCity.map((r: any) => <tr key={r.city} className="border-b border-ink-100 last:border-0"><td className="py-2 font-medium">{r.city}</td><td className="py-2 text-end text-ink-500">{t('admin.vehiclesN', { n: num(r.vehicles) })}</td><td className="py-2 text-end font-semibold">{t('admin.bookingsN', { n: num(r.bookings) })}</td></tr>)}
          </tbody></table>
        </Card>
      </div>
    </div>
  );
}

function Verifications({ onChange }: { onChange: () => void }) {
  const t = useT();
  const { dateTime, date } = useFormat();
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const { data, reload, loading } = useApi<{ items: any[] }>(`/api/admin/verifications?status=${status}`, [status]);
  const [note, setNote] = useState('');
  const decide = async (id: number, decision: 'approved' | 'rejected') => {
    await api.post(`/api/admin/verifications/${id}`, { decision, note: note || undefined });
    toast(t(`admin.verif.${decision}`)); setNote(''); reload(); onChange();
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{['pending', 'approved', 'rejected'].map((s) => <button key={s} onClick={() => setStatus(s)} className={`chip ${status === s ? 'chip-on' : ''}`}>{t(`status.${s}`)}</button>)}</div>
      {loading ? <PageLoader /> : !data?.items.length ? <Card><Empty icon="shield" title={t('admin.verif.empty')} /></Card> : data.items.map((v) => (
        <Card key={v.id} className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-bold">{v.full_name}<Badge tone="blue">{t(`verification.types.${v.type}`)}</Badge><StatusBadge status={v.status} /></div>
              <div className="mt-1 text-sm text-ink-500" dir="ltr">{v.email}</div>
              <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <span>{t('account.docNumber')}: <b dir="ltr">{v.document_number}</b></span>
                {v.license_class && <span>{t('account.licenseClass')}: <b>SIM {v.license_class}</b></span>}
                {v.expires_on && <span>{t('account.expiry')}: <b>{date(v.expires_on)}</b></span>}
                <span>{t('account.dob')}: <b>{v.date_of_birth ? date(v.date_of_birth) : '—'}</b></span>
                <span className="text-ink-500">{dateTime(v.created_at)}</span>
              </div>
            </div>
            {v.has_document ? <a href={`/api/admin/verifications/${v.id}/document`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-ink-200 hover:bg-ink-50"><Icon name="document" size={16} />{t('admin.verif.viewDoc')}</a>
              : <Badge>{t('admin.verif.demoNoDoc')}</Badge>}
          </div>
          {v.status === 'pending' && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
              <Input className="h-9 max-w-sm flex-1 text-sm" placeholder={t('admin.verif.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" variant="success" icon="check" onClick={() => decide(v.id, 'approved')}>{t('admin.approve')}</Button>
              <Button size="sm" variant="danger" icon="x" onClick={() => decide(v.id, 'rejected')}>{t('admin.reject')}</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Users() {
  const t = useT();
  const { date, num } = useFormat();
  const toast = useToast();
  const errText = useErrorText();
  const [q, setQ] = useState('');
  const { data, reload } = useApi<{ items: any[] }>('/api/admin/users' + qs({ q }), [q]);
  const update = async (id: number, body: any) => { try { await api.patch(`/api/admin/users/${id}`, body); toast(t('admin.updated')); reload(); } catch (e) { toast(errText(e), 'error'); } };
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 p-4"><Input placeholder={t('admin.searchUsers')} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500"><tr>{['name', 'role', 'verification', 'activity', 'joined', 'status', ''].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h && t(`admin.cols.${h}`)}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100">
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><div className="font-semibold">{u.full_name} {!!u.is_demo && <DemoBadge />}</div><div className="text-xs text-ink-500" dir="ltr">{u.email}</div></td>
                <td className="px-4 py-3"><Badge>{t(`roles.${u.role}`)}</Badge></td>
                <td className="px-4 py-3 text-xs">{u.email_verified_at ? '✓ ' : '✗ '}{t('auth.email')}<br />{u.phone_verified_at ? '✓ ' : '✗ '}{t('auth.phone')}</td>
                <td className="px-4 py-3 text-xs text-ink-600">{t('admin.activity', { r: num(u.rentals), v: num(u.vehicles) })}{u.reports > 0 && <div className="font-semibold text-red-600">{t('admin.reportsN', { n: num(u.reports) })}</div>}{u.cancellations > 2 && <div className="font-semibold text-amber-600">{t('admin.flagCancels', { n: num(u.cancellations) })}</div>}</td>
                <td className="px-4 py-3 text-ink-500">{date(u.created_at)}</td>
                <td className="px-4 py-3"><StatusBadge status={u.status === 'active' ? 'active' : 'suspended'} /></td>
                <td className="px-4 py-3 text-end">{u.role !== 'admin' && (u.status === 'active'
                  ? <Button size="sm" variant="danger" onClick={() => update(u.id, { status: 'suspended' })}>{t('admin.suspend')}</Button>
                  : <Button size="sm" variant="secondary" onClick={() => update(u.id, { status: 'active' })}>{t('admin.reinstate')}</Button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Vehicles({ onChange }: { onChange: () => void }) {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const { data, reload } = useApi<{ items: any[] }>('/api/admin/vehicles' + qs({ status }), [status]);
  const act = async (id: number, action: string) => { await api.post(`/api/admin/vehicles/${id}`, { action }); toast(t('admin.updated')); reload(); onChange(); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{['', 'pending_review', 'active', 'suspended', 'paused'].map((s) => <button key={s} onClick={() => setStatus(s)} className={`chip ${status === s ? 'chip-on' : ''}`}>{s ? t(`status.${s}`) : t('search.all')}</button>)}</div>
      <Card className="divide-y divide-ink-100">
        {!data?.items.length && <Empty icon="bike" title={t('admin.noData')} />}
        {data?.items.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <Icon name={v.category === 'bicycle' ? 'bike' : 'moto'} className="text-ink-400" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><Link to={`/vehicles/${v.id}`} className="font-semibold hover:underline">{v.name}</Link><StatusBadge status={v.status} />{!!v.is_demo && <DemoBadge />}{v.reports > 0 && <Badge tone="red">{t('admin.reportsN', { n: v.reports })}</Badge>}</div>
              <div className="text-xs text-ink-500">{v.owner_name} · {v.city_name}{v.plate_number && <> · <span dir="ltr">{v.plate_number}</span></>}{v.category === 'motorcycle' && <> · STNK: {t(`status.${v.registration_status === 'not_required' ? 'approved' : v.registration_status}`)}</>}</div>
            </div>
            {!!v.has_registration_doc && <a href={`/api/admin/vehicles/${v.id}/registration`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-600 hover:underline">{t('admin.viewStnk')}</a>}
            {v.status === 'pending_review' && <><Button size="sm" variant="success" onClick={() => act(v.id, 'approve')}>{t('admin.approve')}</Button><Button size="sm" variant="danger" onClick={() => act(v.id, 'reject')}>{t('admin.reject')}</Button></>}
            {v.status === 'active' && <Button size="sm" variant="danger" onClick={() => act(v.id, 'suspend')}>{t('admin.suspend')}</Button>}
            {v.status === 'suspended' && <Button size="sm" variant="secondary" onClick={() => act(v.id, 'reinstate')}>{t('admin.reinstate')}</Button>}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Bookings() {
  const t = useT();
  const { money, dateTime } = useFormat();
  const [status, setStatus] = useState('');
  const { data } = useApi<{ items: any[] }>('/api/admin/bookings' + qs({ status }), [status]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{['', 'pending', 'accepted', 'confirmed', 'active', 'completed', 'cancelled', 'expired'].map((s) => <button key={s} onClick={() => setStatus(s)} className={`chip ${status === s ? 'chip-on' : ''}`}>{s ? t(`status.${s}`) : t('search.all')}</button>)}</div>
      <Card className="divide-y divide-ink-100">
        {!data?.items.length && <Empty icon="calendar" title={t('admin.noData')} />}
        {data?.items.map((b) => (
          <Link key={b.id} to={`/bookings/${b.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-ink-50">
            <span dir="ltr" className="font-mono text-xs text-ink-500">{b.code}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{b.vehicle_name} <span className="font-normal text-ink-500">· {b.renter_name} → {b.owner_name}</span></span>
            <span className="text-ink-500">{dateTime(b.start_at)}</span><span className="font-semibold">{money(b.total)}</span><StatusBadge status={b.status} />{!!b.is_demo && <DemoBadge />}
          </Link>
        ))}
      </Card>
    </div>
  );
}

function Finance() {
  const t = useT();
  const { money, dateTime } = useFormat();
  const { data } = useApi<any>('/api/admin/transactions');
  if (!data) return <PageLoader />;
  const months = [...new Set(data.monthly.map((m: any) => m.month))] as string[];
  const types = ['renter_charge', 'platform_commission', 'owner_earning', 'refund', 'late_fee'];
  return (
    <div className="space-y-6">
      <Notice tone="demo">{t('admin.financeDemo')}</Notice>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3 text-start">{t('admin.month')}</th>{types.map((ty) => <th key={ty} className="px-4 py-3 text-end">{t(`ledger.${ty}`)}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100">{months.map((m) => <tr key={m}><td className="px-4 py-3 font-semibold" dir="ltr">{m}</td>{types.map((ty) => <td key={ty} className="px-4 py-3 text-end">{money(data.monthly.find((x: any) => x.month === m && x.type === ty)?.amount ?? 0)}</td>)}</tr>)}</tbody>
        </table>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4 font-bold">{t('admin.ledger')}</div>
        <div className="max-h-[480px] divide-y divide-ink-100 overflow-y-auto">
          {data.items.map((x: any) => (
            <div key={x.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <div><span className="font-semibold">{t(`ledger.${x.type}`)}</span> <span className="text-xs text-ink-500">· <span dir="ltr">{x.booking_code}</span> · {x.user_name ?? 'VELOX'}</span></div>
              <div className="flex items-center gap-3"><span className="text-xs text-ink-400">{dateTime(x.created_at)}</span><span className="font-semibold">{money(x.amount)}</span></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Reports({ onChange }: { onChange: () => void }) {
  const t = useT();
  const { dateTime, money } = useFormat();
  const toast = useToast();
  const reports = useApi<{ items: any[] }>('/api/admin/reports');
  const disputes = useApi<{ items: any[] }>('/api/admin/disputes');
  const [resolve, setResolve] = useState<any>(null);
  const [form, setForm] = useState({ status: 'resolved_owner', resolution: '', awardAmount: '' });
  const setReport = async (id: number, status: string) => { await api.post(`/api/admin/reports/${id}`, { status }); toast(t('admin.updated')); reports.reload(); onChange(); };
  const saveDispute = async () => {
    await api.post(`/api/admin/disputes/${resolve.id}`, { status: form.status, resolution: form.resolution || undefined, awardAmount: Number(form.awardAmount || 0) });
    toast(t('admin.updated')); setResolve(null); disputes.reload(); onChange();
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 font-bold">{t('admin.disputes')}</h3>
        <Card className="divide-y divide-ink-100">
          {!disputes.data?.items.length && <Empty icon="flag" title={t('admin.noData')} />}
          {disputes.data?.items.map((d) => (
            <div key={d.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><b>{t(`dispute.reasons.${d.reason}`)}</b><StatusBadge status={d.status} /><span dir="ltr" className="font-mono text-xs text-ink-500">{d.booking_code}</span></div>
              <p className="mt-1 text-ink-600">{d.details}</p>
              <div className="mt-1 text-xs text-ink-500">{d.opened_by_name} · {dateTime(d.created_at)} · {t('admin.depositHeld', { amount: money(d.deposit) })}</div>
              {['open', 'reviewing'].includes(d.status) && <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setResolve(d); setForm({ status: 'resolved_owner', resolution: '', awardAmount: String(d.claimed_amount || d.deposit) }); }}>{t('admin.resolve')}</Button>}
            </div>
          ))}
        </Card>
      </div>
      <div>
        <h3 className="mb-3 font-bold">{t('admin.reports')}</h3>
        <Card className="divide-y divide-ink-100">
          {!reports.data?.items.length && <Empty icon="flag" title={t('admin.noData')} />}
          {reports.data?.items.map((r) => (
            <div key={r.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><b>{t(`report.reasons.${r.reason}`)}</b><Badge>{t(`admin.target.${r.target_type}`)} #{r.target_id}</Badge><StatusBadge status={r.status} /></div>
              {r.details && <p className="mt-1 text-ink-600">{r.details}</p>}
              <div className="mt-1 text-xs text-ink-500">{r.reporter_name} · {dateTime(r.created_at)}</div>
              {['open', 'reviewing'].includes(r.status) && <div className="mt-3 flex gap-2">
                {r.target_type === 'vehicle' && <Link to={`/vehicles/${r.target_id}`} className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ring-1 ring-ink-200">{t('common.view')}</Link>}
                <Button size="sm" variant="secondary" onClick={() => setReport(r.id, 'resolved')}>{t('admin.markResolved')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setReport(r.id, 'dismissed')}>{t('admin.dismiss')}</Button></div>}
            </div>
          ))}
        </Card>
      </div>
      <Modal open={!!resolve} onClose={() => setResolve(null)} title={t('admin.resolveDispute')} footer={<Button onClick={saveDispute}>{t('common.save')}</Button>}>
        <div className="space-y-4">
          <Field label={t('admin.outcome')}><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['reviewing', 'resolved_owner', 'resolved_renter', 'closed'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field>
          {form.status === 'resolved_owner' && <Field label={t('admin.award')} hint={t('admin.awardHint')}><Input type="number" value={form.awardAmount} onChange={(e) => setForm({ ...form, awardAmount: e.target.value })} /></Field>}
          <Field label={t('admin.resolution')}><Textarea rows={3} value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Cities() {
  const t = useT();
  const toast = useToast();
  const errText = useErrorText();
  const { data, reload } = useApi<{ items: any[] }>('/api/admin/locations');
  const [f, setF] = useState({ type: 'city', parentId: '', name: '', lat: '', lng: '', utcOffsetMinutes: '420' });
  const provinces = data?.items.filter((l) => l.type === 'province') ?? [];
  const add = async () => {
    try {
      await api.post('/api/admin/locations', { type: f.type, parentId: f.parentId ? Number(f.parentId) : null, name: f.name, lat: f.lat ? Number(f.lat) : undefined, lng: f.lng ? Number(f.lng) : undefined, utcOffsetMinutes: Number(f.utcOffsetMinutes) });
      toast(t('admin.cityAdded')); setF({ ...f, name: '', lat: '', lng: '' }); reload();
    } catch (e) { toast(errText(e), 'error'); }
  };
  const toggle = async (id: number, isActive: boolean) => { await api.patch(`/api/admin/locations/${id}`, { isActive }); reload(); };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="divide-y divide-ink-100">
        {data?.items.map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            <Badge tone={l.type === 'province' ? 'violet' : 'blue'}>{t(`admin.locTypes.${l.type}`)}</Badge>
            <span className="flex-1 font-semibold">{l.name} {l.parent_name && <span className="font-normal text-ink-500">· {l.parent_name}</span>}</span>
            <span className="text-xs text-ink-500">UTC+{l.utc_offset_minutes / 60}</span>
            <Button size="sm" variant={l.is_active ? 'ghost' : 'secondary'} onClick={() => toggle(l.id, !l.is_active)}>{l.is_active ? t('admin.deactivate') : t('admin.activate')}</Button>
          </div>
        ))}
      </Card>
      <Card className="h-fit p-6">
        <h3 className="mb-4 font-bold">{t('admin.addLocation')}</h3>
        <div className="space-y-3">
          <Field label={t('admin.locType')}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="city">{t('admin.locTypes.city')}</option><option value="province">{t('admin.locTypes.province')}</option></Select></Field>
          {f.type === 'city' && <Field label={t('admin.locTypes.province')}><Select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}><option value="">—</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
          <Field label={t('admin.name')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label={t('vehicleForm.lat')}><Input dir="ltr" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></Field><Field label={t('vehicleForm.lng')}><Input dir="ltr" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} /></Field></div>
          <Field label={t('admin.timezone')}><Select value={f.utcOffsetMinutes} onChange={(e) => setF({ ...f, utcOffsetMinutes: e.target.value })}><option value="420">WIB (UTC+7)</option><option value="480">WITA (UTC+8)</option><option value="540">WIT (UTC+9)</option></Select></Field>
          <Button className="w-full" icon="plus" disabled={f.name.length < 2} onClick={add}>{t('admin.add')}</Button>
        </div>
        <p className="mt-3 text-xs text-ink-500">{t('admin.citiesHint')}</p>
      </Card>
    </div>
  );
}

function Settings() {
  const t = useT();
  const toast = useToast();
  const { dateTime, num } = useFormat();
  const { data, reload } = useApi<any>('/api/admin/settings');
  const [rate, setRate] = useState('');
  const [vals, setVals] = useState<Record<string, string> | null>(null);
  if (!data) return <PageLoader />;
  const v = vals ?? data.settings;
  const current = data.commissions[0];
  const saveSettings = async () => { await api.put('/api/admin/settings', v); toast(t('admin.updated')); reload(); };
  const saveRate = async () => { await api.post('/api/admin/commissions', { ratePercent: Number(rate), category: null }); setRate(''); toast(t('admin.updated')); reload(); };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h3 className="font-bold">{t('admin.commission')}</h3>
        <p className="mt-1 text-sm text-ink-500">{t('admin.commissionHint')}</p>
        <div className="mt-4 rounded-2xl bg-ink-50 p-4"><div className="text-sm text-ink-500">{t('admin.currentRate')}</div><div className="text-3xl font-extrabold">{num((current?.rate ?? 0.1) * 100)}%</div>
          <div className="text-sm text-ink-600">{t('admin.ownerGets', { pct: num(100 - (current?.rate ?? 0.1) * 100) })}</div></div>
        <div className="mt-4 flex gap-2"><Input type="number" min={0} max={50} step={0.5} placeholder="10" value={rate} onChange={(e) => setRate(e.target.value)} className="max-w-32" /><Button disabled={rate === '' || Number(rate) < 0 || Number(rate) > 50} onClick={saveRate}>{t('admin.applyRate')}</Button></div>
        <div className="mt-5 text-xs font-bold uppercase tracking-wide text-ink-500">{t('admin.history')}</div>
        <ul className="mt-2 space-y-1 text-sm">{data.commissions.map((c: any) => <li key={c.id} className="flex justify-between"><span>{num(c.rate * 100)}%</span><span className="text-ink-500">{dateTime(c.effective_from)}</span></li>)}</ul>
      </Card>
      <Card className="p-6">
        <h3 className="font-bold">{t('admin.rules')}</h3>
        <div className="mt-4 space-y-3">
          {Object.keys(data.settings).map((k) => (
            <Field key={k} label={t(`admin.settings.${k}`)}><Input type="number" value={v[k]} onChange={(e) => setVals({ ...v, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <Button className="mt-5" onClick={saveSettings}>{t('common.saveChanges')}</Button>
      </Card>
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-center gap-2"><h3 className="font-bold">{t('admin.translations')}</h3><Badge tone="amber">{t('common.comingSoon')}</Badge></div>
        <p className="mt-1 text-sm text-ink-500">{t('admin.translationsHint')}</p>
      </Card>
    </div>
  );
}
