import { useState } from 'react';
import { useT } from '../i18n';
import { Link, navigate } from '../lib/router';
import { useApi, useInterval } from '../lib/hooks';
import { api, fileToDataUrl } from '../lib/api';
import { useFormat, tzLabel } from '../lib/format';
import { Icon } from '../components/icons';
import { Avatar, Badge, Button, Card, DemoBadge, Empty, Field, Input, Modal, Notice, PageLoader, StatusBadge, Textarea, Toggle, cx, useErrorText, useToast } from '../components/ui';
import { PageHeader } from '../components/Layout';

const METHODS = ['qris', 'ewallet', 'bank_transfer', 'card'] as const;
const CHECK_ITEMS = { bicycle: ['frame', 'tires', 'brakes', 'chain', 'lights', 'lock'], motorcycle: ['body', 'tires', 'brakes', 'lights', 'fuel', 'documents', 'helmet'] };
const STEPS = ['pending', 'accepted', 'confirmed', 'active', 'completed'];

export function BookingDetail({ id }: { id: number }) {
  const t = useT();
  const { money, dateTime, duration, num } = useFormat();
  const toast = useToast();
  const errText = useErrorText();
  const { data, loading, error, reload } = useApi<any>(`/api/bookings/${id}`, [id]);
  const [modal, setModal] = useState<null | 'pay' | 'cancel' | 'reject' | 'start' | 'complete' | 'extend' | 'dispute'>(null);
  const [busy, setBusy] = useState(false);
  useInterval(reload, data && ['pending', 'accepted', 'confirmed', 'active'].includes(data.booking.status) ? 20_000 : null);

  if (loading) return <PageLoader />;
  if (error || !data) return <div className="container-x py-20"><Empty icon="calendar" title={t('booking.notFound')} /></div>;

  const { booking: b, vehicle: v, role } = data;
  const offset = v.utc_offset_minutes;
  const other = role === 'renter' ? data.owner : data.renter;
  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); setModal(null); reload(); } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  const stepIndex = STEPS.indexOf(b.status);
  const terminal = ['rejected', 'cancelled', 'expired'].includes(b.status);
  const back = role === 'owner' ? { to: '/dashboard/owner?tab=bookings', label: t('nav.ownerDashboard') } : { to: '/dashboard', label: t('nav.myBookings') };

  return (
    <div className="container-x max-w-6xl py-8 sm:py-10">
      <PageHeader back={back}
        title={<span className="flex flex-wrap items-center gap-3">{t('booking.booking')} <span dir="ltr" className="font-mono text-ink-500">{b.code}</span> <StatusBadge status={b.status} />{!!b.is_demo && <DemoBadge />}</span>}
        subtitle={t(`booking.statusHelp.${role === 'owner' ? 'owner' : 'renter'}.${b.status}`)} />

      {/* Progress */}
      {!terminal && (
        <div className="mb-10 pt-8">
          <div className="soft-track relative h-2.5 rounded-full">
            <div className="soft-fill absolute inset-y-0 start-0 rounded-full transition-all duration-700" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
            <div className="absolute -top-9 -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${((stepIndex + 1) / STEPS.length) * 100}%` }}>
              <span className="relative block whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-ink-700 shadow-[0_4px_12px_-2px_rgb(36_78_140/0.3)]">
                {t(`status.${b.status}`)}
                <span className="absolute -bottom-1 start-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white rtl:translate-x-1/2" />
              </span>
            </div>
          </div>
          <div className="mt-3 hidden grid-cols-5 sm:grid">
            {STEPS.map((st, i) => <div key={st} className={cx('text-xs font-semibold', i <= stepIndex ? 'text-ink-800' : 'text-ink-400')}>{t(`status.${st}`)}</div>)}
          </div>
        </div>
      )}


      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Primary action panel */}
          <ActionPanel data={data} onOpen={setModal} busy={busy}
            onAccept={() => act(() => api.post(`/api/bookings/${id}/respond`, { decision: 'accept' }), t('booking.toast.accepted'))} />

          {/* Vehicle & schedule */}
          <Card className="overflow-hidden">
            <Link to={`/vehicles/${v.id}`} className="flex gap-4 p-5 transition hover:bg-ink-50">
              <img src={v.cover_url} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="font-bold">{v.name}</div>
                <div className="text-sm text-ink-500">{v.brand} {v.model} · {t(`vehicleTypes.${v.type}`)}</div>
                <div className="mt-1 flex items-center gap-1 text-sm text-ink-600"><Icon name="pin" size={14} />{v.pickup_address}</div>
              </div>
            </Link>
            <div className="grid border-t border-ink-100 sm:grid-cols-3">
              <Info label={t('booking.pickup')} value={dateTime(b.start_at, offset)} />
              <Info label={t('booking.return')} value={dateTime(b.end_at, offset)} />
              <Info label={t('booking.duration')} value={duration(Math.round((new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000))} />
            </div>
            <div className="border-t border-ink-100 px-5 py-2.5 text-xs text-ink-500">{t('booking.timesIn', { tz: tzLabel(offset) })}</div>
          </Card>

          {/* Handover checklists */}
          {data.checklists.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-4 font-bold">{t('handover.title')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {data.checklists.map((c: any) => (
                  <div key={c.stage} className="rounded-xl bg-ink-50 p-4">
                    <div className="flex items-center justify-between"><span className="font-semibold">{t(`handover.${c.stage}`)}</span>
                      <Badge tone={c.condition_ok ? 'green' : 'red'}>{c.condition_ok ? t('handover.ok') : t('handover.issue')}</Badge></div>
                    <div className="mt-1 text-xs text-ink-500">{dateTime(c.created_at, offset)}</div>
                    <ul className="mt-3 grid grid-cols-2 gap-1 text-sm">
                      {Object.entries(c.items).map(([k, ok]) => <li key={k} className="flex items-center gap-1.5"><Icon name={ok ? 'check' : 'x'} size={14} className={ok ? 'text-emerald-500' : 'text-red-500'} />{t(`handover.items.${k}`)}</li>)}
                    </ul>
                    {c.notes && <p className="mt-2 text-sm text-ink-600">“{c.notes}”</p>}
                    {c.photo_urls.length > 0 && <div className="mt-3 flex gap-2">{c.photo_urls.map((u: string) => <img key={u} src={u} className="h-14 w-14 rounded-lg object-cover" alt="" />)}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data.dispute && <Notice tone="warn" title={t('dispute.title')}>{t(`dispute.reasons.${data.dispute.reason}`)} · <StatusBadge status={data.dispute.status} />{data.dispute.resolution && <div className="mt-1">{data.dispute.resolution}</div>}</Notice>}

          {/* Review */}
          {b.status === 'completed' && <ReviewBox booking={b} role={role} existing={data.myReview} onDone={reload} />}

          {/* Timeline */}
          <Card className="p-5">
            <h3 className="mb-4 font-bold">{t('booking.timeline')}</h3>
            <ol className="relative space-y-4 border-s-2 border-ink-100 ps-5">
              {data.history.map((h: any, i: number) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                  <div className="text-sm font-semibold">{h.note === 'extended' ? t('booking.extendedEvent') : t(`status.${h.to_status}`)}</div>
                  <div className="text-xs text-ink-500">{dateTime(h.created_at, offset)}{h.note && h.note !== 'extended' && h.note !== 'demo_seed' ? ` · ${t(`booking.notes.${h.note}`) !== `booking.notes.${h.note}` ? t(`booking.notes.${h.note}`) : h.note}` : ''}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 font-bold">{t('booking.priceDetails')}</h3>
            <div className="space-y-2 text-sm">
              {b.price_breakdown.lines.map((l: any) => <Row key={l.duration_minutes} label={`${num(l.qty)} × ${duration(l.duration_minutes)}`} value={money(l.price * l.qty)} />)}
              {b.extension_total > 0 && <Row label={t('booking.extensions')} value={money(b.extension_total)} />}
              {b.deposit > 0 && <Row label={t('booking.depositRefundable')} value={money(b.deposit)} />}
              {b.late_fee > 0 && <Row label={t('booking.lateFee')} value={money(b.late_fee)} />}
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold"><span>{t('booking.total')}</span><span>{money(b.total + b.late_fee)}</span></div>
              {b.refund_amount > 0 && <Row label={t('booking.refunded')} value={money(b.refund_amount)} />}
              {role === 'owner' && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">
                <Row label={t('booking.yourEarning', { pct: num(Math.round((1 - b.commission_rate) * 100)) })} value={money(Math.round(b.subtotal * (1 - b.commission_rate)))} />
              </div>}
            </div>
            {data.payments.length > 0 && (
              <div className="mt-5 border-t border-ink-100 pt-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{t('booking.payments')}</div>
                {data.payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span>{t(`payment.methods.${p.method}`)} {p.purpose === 'extension' && `(${t('booking.extension')})`} {!!p.is_test && <DemoBadge />}</span>
                    <span className="flex items-center gap-2">{money(p.amount)} <StatusBadge status={p.status} /></span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">{role === 'renter' ? t('booking.owner') : t('booking.renter')}</div>
            <div className="flex items-center gap-3">
              <Avatar name={other.full_name} url={other.avatar_url} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{other.full_name}</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {!!other.identity_verified && <Badge tone="green" icon="shield">{t('verification.idVerified')}</Badge>}
                  {!!other.phone_verified && <Badge tone="blue" icon="phone">{t('verification.phoneVerified')}</Badge>}
                </div>
              </div>
            </div>
            {data.conversationId && <Button variant="secondary" icon="chat" className="mt-4 w-full" onClick={() => navigate(`/messages/${data.conversationId}`)}>{t('booking.message')}</Button>}
          </Card>

          <Card className="p-5 text-sm">
            <div className="mb-2 font-bold">{t('booking.agreement')}</div>
            <p className="text-ink-600">{t('booking.agreementStatus', { v: data.agreement?.version ?? '—' })}</p>
            <ul className="mt-2 space-y-1 text-ink-600">
              <li className="flex items-center gap-1.5"><Icon name={data.agreement?.renter_accepted_at ? 'check' : 'clock'} size={14} />{t('booking.renter')}</li>
              <li className="flex items-center gap-1.5"><Icon name={data.agreement?.owner_accepted_at ? 'check' : 'clock'} size={14} />{t('booking.owner')}</li>
            </ul>
            <Link to="/terms" className="mt-3 inline-block font-semibold text-brand-600 hover:underline">{t('vehicle.readAgreement')}</Link>
          </Card>

          {['confirmed', 'active', 'completed'].includes(b.status) && !data.dispute && (
            <button onClick={() => setModal('dispute')} className="flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-red-600"><Icon name="flag" size={15} />{t('dispute.open')}</button>
          )}
        </div>
      </div>

      {/* ───── Modals ───── */}
      <PayModal open={modal === 'pay'} onClose={() => setModal(null)} booking={b} />
      <ConfirmModal open={modal === 'cancel'} onClose={() => setModal(null)} title={t('booking.cancelTitle')} busy={busy} danger
        body={b.status === 'confirmed' ? (role === 'renter' ? t('booking.cancelPolicy') : t('booking.ownerCancelPolicy')) : t('booking.cancelFree')}
        withReason onConfirm={(reason) => act(() => api.post(`/api/bookings/${id}/cancel`, { reason }), t('booking.toast.cancelled'))} confirmLabel={t('booking.cancel')} />
      <ConfirmModal open={modal === 'reject'} onClose={() => setModal(null)} title={t('booking.rejectTitle')} busy={busy} danger withReason
        body={t('booking.rejectBody')} onConfirm={(reason) => act(() => api.post(`/api/bookings/${id}/respond`, { decision: 'reject', reason }), t('booking.toast.rejected'))} confirmLabel={t('booking.reject')} />
      <ChecklistModal open={modal === 'start' || modal === 'complete'} stage={modal === 'complete' ? 'return' : 'pickup'} category={v.category} busy={busy}
        onClose={() => setModal(null)} onSubmit={(payload) => act(() => api.post(`/api/bookings/${id}/${modal === 'complete' ? 'complete' : 'start'}`, payload),
          modal === 'complete' ? t('booking.toast.completed') : t('booking.toast.started'))} />
      <ExtendModal open={modal === 'extend'} onClose={() => setModal(null)} booking={b} offset={offset} />
      <DisputeModal open={modal === 'dispute'} onClose={() => setModal(null)} bookingId={id} onDone={reload} />
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => <div className="flex justify-between gap-3"><span className="text-ink-600">{label}</span><span className="font-semibold">{value}</span></div>;
const Info = ({ label, value }: { label: string; value: string }) => <div className="border-ink-100 p-5 sm:border-e last:border-e-0"><div className="text-xs font-semibold text-ink-500">{label}</div><div className="mt-1 font-bold">{value}</div></div>;

function ActionPanel({ data, onOpen, onAccept, busy }: { data: any; onOpen: (m: any) => void; onAccept: () => void; busy: boolean }) {
  const t = useT();
  const { relative, money } = useFormat();
  const { booking: b, role } = data;
  const isRenter = role === 'renter';
  const s = b.status;

  if (isRenter && s === 'accepted') return (
    <Card className="border-2 border-brand-500 p-6">
      <h2 className="text-lg font-bold">{t('booking.panel.payTitle')}</h2>
      <p className="mt-1 text-sm text-ink-600">{t('booking.panel.payBody', { when: b.expires_at ? relative(b.expires_at) : '' })}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="brand" icon="wallet" onClick={() => onOpen('pay')}>{t('booking.payNow', { amount: money(b.total) })}</Button>
        <Button variant="ghost" onClick={() => onOpen('cancel')}>{t('booking.cancel')}</Button></div>
    </Card>
  );
  if (isRenter && s === 'pending') return (
    <Card className="p-6"><h2 className="text-lg font-bold">{t('booking.panel.waitingTitle')}</h2>
      <p className="mt-1 text-sm text-ink-600">{t('booking.panel.waitingBody', { when: b.expires_at ? relative(b.expires_at) : '' })}</p>
      <Button variant="ghost" className="mt-3 -ms-3" onClick={() => onOpen('cancel')}>{t('booking.cancelRequest')}</Button></Card>
  );
  if (isRenter && s === 'confirmed') return (
    <Card className="overflow-hidden">
      <div className="bg-[linear-gradient(150deg,#2b76ff_0%,#184bc6_60%,#123068_100%)] p-6 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-300"><Icon name="qr" size={18} />{t('booking.panel.codeTitle')}</div>
        <div className="mt-3 flex gap-2" dir="ltr">{String(b.pickup_code).split('').map((d: string, i: number) => <span key={i} className="flex h-14 w-11 items-center justify-center rounded-xl bg-white/10 font-mono text-3xl font-semibold">{d}</span>)}</div>
        <p className="mt-3 text-sm text-ink-300">{t('booking.panel.codeBody')}</p>
        <p className="mt-1 text-xs text-ink-400">{t('booking.panel.qrSoon')}</p>
      </div>
      <div className="p-6">
        <h3 className="font-bold">{t('booking.panel.instructionsTitle')}</h3>
        <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-ink-600">
          {[1, 2, 3, 4].map((n) => <li key={n}>{t(`booking.panel.instr${n}`)}</li>)}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" icon="clock" onClick={() => onOpen('extend')}>{t('booking.extend')}</Button>
          <Button variant="ghost" onClick={() => onOpen('cancel')}>{t('booking.cancel')}</Button></div>
      </div>
    </Card>
  );
  if (isRenter && s === 'active') return (
    <Card className="border-2 border-emerald-500 p-6"><h2 className="text-lg font-bold">{t('booking.panel.activeTitle')}</h2>
      <p className="mt-1 text-sm text-ink-600">{t('booking.panel.activeBody', { when: relative(b.end_at) })}</p>
      <Button variant="secondary" icon="clock" className="mt-4" onClick={() => onOpen('extend')}>{t('booking.extend')}</Button></Card>
  );
  if (!isRenter && s === 'pending') return (
    <Card className="border-2 border-amber-400 p-6"><h2 className="text-lg font-bold">{t('booking.panel.requestTitle', { name: data.renter.full_name })}</h2>
      <p className="mt-1 text-sm text-ink-600">{t('booking.panel.requestBody', { when: b.expires_at ? relative(b.expires_at) : '' })}</p>
      {b.renter_note && <p className="mt-3 rounded-xl bg-ink-50 p-3 text-sm italic text-ink-700">“{b.renter_note}”</p>}
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="success" icon="check" loading={busy} onClick={onAccept}>{t('booking.accept')}</Button>
        <Button variant="danger" onClick={() => onOpen('reject')}>{t('booking.reject')}</Button></div></Card>
  );
  if (!isRenter && s === 'accepted') return <Notice tone="info" title={t('booking.panel.awaitPayTitle')}>{t('booking.panel.awaitPayBody')}</Notice>;
  if (!isRenter && s === 'confirmed') return (
    <Card className="border-2 border-brand-500 p-6"><h2 className="text-lg font-bold">{t('booking.panel.handoverTitle')}</h2>
      <p className="mt-1 text-sm text-ink-600">{t('booking.panel.handoverBody')}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="brand" icon="play" onClick={() => onOpen('start')}>{t('booking.startRental')}</Button>
        <Button variant="ghost" onClick={() => onOpen('cancel')}>{t('booking.cancel')}</Button></div></Card>
  );
  if (!isRenter && s === 'active') return (
    <Card className="border-2 border-emerald-500 p-6"><h2 className="text-lg font-bold">{t('booking.panel.returnTitle')}</h2>
      <p className="mt-1 text-sm text-ink-600">{t('booking.panel.returnBody', { when: relative(b.end_at) })}</p>
      <Button variant="success" icon="check" className="mt-4" onClick={() => onOpen('complete')}>{t('booking.completeRental')}</Button></Card>
  );
  return null;
}

function PayModal({ open, onClose, booking }: { open: boolean; onClose: () => void; booking: any }) {
  const t = useT();
  const { money } = useFormat();
  const errText = useErrorText();
  const toast = useToast();
  const [method, setMethod] = useState<typeof METHODS[number]>('qris');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/bookings/${booking.id}/pay`, { method }); navigate(r.checkoutUrl); }
    catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('payment.choose')} footer={<Button variant="brand" loading={busy} onClick={go}>{t('payment.continue', { amount: money(booking.total) })}</Button>}>
      <div className="space-y-2">
        {METHODS.map((m) => (
          <button key={m} onClick={() => setMethod(m)} className={cx('flex w-full items-center gap-3 rounded-2xl p-4 text-start ring-1 transition', method === m ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-ink-200 hover:ring-ink-300')}>
            <span className="neu-icon h-10 w-10"><Icon name={m === 'qris' ? 'qr' : m === 'card' ? 'wallet' : m === 'ewallet' ? 'phone' : 'layers'} /></span>
            <span className="flex-1"><span className="block font-semibold">{t(`payment.methods.${m}`)}</span><span className="text-xs text-ink-500">{t(`payment.methodDesc.${m}`)}</span></span>
            {method === m && <Icon name="check" className="text-brand-600" />}
          </button>
        ))}
      </div>
      <div className="mt-4"><Notice tone="demo">{t('payment.demoNotice')}</Notice></div>
    </Modal>
  );
}

function ConfirmModal({ open, onClose, title, body, onConfirm, confirmLabel, busy, danger, withReason }:
  { open: boolean; onClose: () => void; title: string; body: string; onConfirm: (reason?: string) => void; confirmLabel: string; busy?: boolean; danger?: boolean; withReason?: boolean }) {
  const t = useT();
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="ghost" onClick={onClose}>{t('common.back')}</Button>
      <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => onConfirm(reason || undefined)}>{confirmLabel}</Button></>}>
      <p className="text-sm text-ink-600">{body}</p>
      {withReason && <Textarea className="mt-4" rows={3} placeholder={t('booking.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} />}
    </Modal>
  );
}

function ChecklistModal({ open, onClose, stage, category, onSubmit, busy }: { open: boolean; onClose: () => void; stage: 'pickup' | 'return'; category: 'bicycle' | 'motorcycle'; onSubmit: (p: any) => void; busy: boolean }) {
  const t = useT();
  const items = CHECK_ITEMS[category];
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [ok, setOk] = useState(true);
  const [notes, setNotes] = useState('');
  const [code, setCode] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const all = items.every((i) => checks[i] !== undefined);
  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const urls = await Promise.all([...files].slice(0, 6 - photos.length).map((f) => fileToDataUrl(f, 1280)));
    setPhotos([...photos, ...urls]);
  };
  return (
    <Modal open={open} onClose={onClose} wide title={stage === 'pickup' ? t('handover.pickupTitle') : t('handover.returnTitle')}
      footer={<Button variant={stage === 'pickup' ? 'brand' : 'success'} loading={busy} disabled={!all || (stage === 'pickup' && code.length !== 6)}
        onClick={() => onSubmit({ items: checks, conditionOk: ok, notes: notes || undefined, photos, ...(stage === 'pickup' ? { pickupCode: code } : {}) })}>
        {stage === 'pickup' ? t('booking.startRental') : t('booking.completeRental')}</Button>}>
      <div className="space-y-6">
        {stage === 'pickup' && (
          <Field label={t('handover.enterCode')} hint={t('handover.codeHint')}>
            <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} dir="ltr" className="h-14 text-center font-mono text-2xl tracking-[0.5em]" placeholder="••••••" />
          </Field>
        )}
        <div>
          <span className="label">{t('handover.checklist')}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2">
                <span className="text-sm font-medium">{t(`handover.items.${i}`)}</span>
                <div className="flex gap-1">
                  <button onClick={() => setChecks({ ...checks, [i]: true })} className={cx('rounded-lg px-2.5 py-1 text-xs font-bold', checks[i] === true ? 'bg-emerald-600 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200')}>{t('handover.good')}</button>
                  <button onClick={() => setChecks({ ...checks, [i]: false })} className={cx('rounded-lg px-2.5 py-1 text-xs font-bold', checks[i] === false ? 'bg-red-600 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200')}>{t('handover.problem')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('handover.photos')}</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => <img key={i} src={p} className="h-16 w-16 rounded-xl object-cover" alt="" />)}
            {photos.length < 6 && <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-ink-200 text-ink-400 hover:border-ink-300">
              <Icon name="camera" /><input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} /></label>}
          </div>
          <p className="mt-1.5 text-xs text-ink-500">{t('handover.photosHint')}</p>
        </div>
        <Textarea rows={2} placeholder={t('handover.notesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {stage === 'return' && (
          <div className="rounded-xl bg-ink-50 p-4">
            <Toggle checked={ok} onChange={setOk} label={t('handover.conditionOk')} />
            {!ok && <p className="mt-2 text-sm text-amber-700">{t('handover.damageNote')}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ExtendModal({ open, onClose, booking, offset }: { open: boolean; onClose: () => void; booking: any; offset: number }) {
  const t = useT();
  const { dateTime, num } = useFormat();
  const errText = useErrorText();
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const newEnd = new Date(new Date(booking.end_at).getTime() + hours * 3600000).toISOString();
  const go = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post(`/api/bookings/${booking.id}/extend`, { newEnd, method: 'qris' }); navigate(r.checkoutUrl); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('booking.extendTitle')} footer={<Button variant="brand" loading={busy} onClick={go}>{t('booking.extendPay')}</Button>}>
      <p className="text-sm text-ink-600">{t('booking.extendBody', { end: dateTime(booking.end_at, offset) })}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {[1, 2, 3, 6, 12, 24].map((h) => <button key={h} onClick={() => setHours(h)} className={cx('chip', hours === h && 'chip-on')}>+{h >= 24 ? t('units.oneDay') : h === 1 ? t('units.oneHour') : t('units.hours', { n: num(h) })}</button>)}
      </div>
      <p className="mt-4 text-sm"><span className="text-ink-500">{t('booking.newReturn')}:</span> <b>{dateTime(newEnd, offset)}</b></p>
      <p className="mt-1 text-xs text-ink-500">{t('booking.extendPriceHint')}</p>
      {err && <div className="mt-4"><Notice tone="error">{err}</Notice></div>}
    </Modal>
  );
}

function DisputeModal({ open, onClose, bookingId, onDone }: { open: boolean; onClose: () => void; bookingId: number; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const errText = useErrorText();
  const [reason, setReason] = useState('damage');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.post(`/api/bookings/${bookingId}/dispute`, { reason, details }); toast(t('dispute.sent')); onClose(); onDone(); }
    catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('dispute.open')} footer={<Button loading={busy} disabled={details.trim().length < 10} onClick={send}>{t('dispute.submit')}</Button>}>
      <div className="flex flex-wrap gap-2">{['damage', 'late_return', 'not_as_described', 'no_show', 'payment', 'other'].map((r) => <button key={r} onClick={() => setReason(r)} className={cx('chip', reason === r && 'chip-on')}>{t(`dispute.reasons.${r}`)}</button>)}</div>
      <Textarea className="mt-4" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('dispute.detailsPlaceholder')} />
      <p className="mt-2 text-xs text-ink-500">{t('dispute.hint')}</p>
    </Modal>
  );
}

function ReviewBox({ booking, role, existing, onDone }: { booking: any; role: string; existing: any; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const errText = useErrorText();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  if (existing) return <Notice tone="success" title={t('review.thanks')}>{'★'.repeat(existing.rating)} {existing.comment}</Notice>;
  if (role === 'admin') return null;
  const send = async () => {
    setBusy(true);
    try { await api.post(`/api/bookings/${booking.id}/review`, { rating, comment: comment || undefined }); toast(t('review.thanks')); onDone(); }
    catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Card className="p-6">
      <h3 className="font-bold">{role === 'renter' ? t('review.titleRenter') : t('review.titleOwner')}</h3>
      <div className="mt-3 flex gap-1">{[1, 2, 3, 4, 5].map((s) => <button key={s} onClick={() => setRating(s)} aria-label={`${s}`}><Icon name="star" size={30} filled={s <= rating} className={s <= rating ? 'text-amber-400' : 'text-ink-200'} /></button>)}</div>
      <Textarea className="mt-3" rows={3} placeholder={t('review.placeholder')} value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button className="mt-3" loading={busy} onClick={send}>{t('review.submit')}</Button>
    </Card>
  );
}

