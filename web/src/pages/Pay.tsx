import { useState } from 'react';
import { useT } from '../i18n';
import { navigate } from '../lib/router';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { useFormat } from '../lib/format';
import { Icon } from '../components/icons';
import { Button, Card, Empty, Notice, PageLoader, StatusBadge, useErrorText } from '../components/ui';

/**
 * DEMO checkout for the mock payment provider. In production this page is replaced by the gateway's
 * hosted checkout / QRIS / virtual-account screen. The booking is confirmed only when the server receives
 * the provider's signed confirmation — the buttons below trigger that server-side simulation.
 */
export function Pay({ providerRef }: { providerRef: string }) {
  const t = useT();
  const { money } = useFormat();
  const errText = useErrorText();
  const { data, loading, error, reload } = useApi<any>(`/api/payments/${providerRef}`, [providerRef]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <PageLoader />;
  if (error || !data) return <div className="container-x py-20"><Empty icon="wallet" title={t('payment.notFound')} /></div>;
  const p = data.payment;

  const simulate = async (outcome: 'succeeded' | 'failed') => {
    setBusy(outcome); setErr(null);
    try {
      const r = await api.post(`/api/payments/mock/${providerRef}/simulate`, { outcome });
      if (r.payment.status === 'succeeded') navigate(`/bookings/${p.booking_id}`, { replace: true });
      else reload();
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };

  return (
    <div className="container-x flex max-w-lg flex-col py-12">
      <div className="mb-4 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-center text-sm font-semibold text-amber-900">
        <Icon name="sparkle" size={16} className="me-1 inline" />{t('payment.demoBanner')}
      </div>
      <Card className="overflow-hidden">
        <div className="bg-ink-900 p-6 text-white">
          <div className="text-sm text-ink-300">{t('payment.mockGateway')}</div>
          <div className="mt-1 text-3xl font-extrabold">{money(p.amount)}</div>
          <div className="mt-1 text-sm text-ink-300">{t('booking.booking')} <span dir="ltr" className="font-mono">{p.booking_code}</span> · {t(`payment.methods.${p.method}`)}</div>
        </div>
        <div className="space-y-5 p-6">
          {p.method === 'qris' && (
            <div className="mx-auto grid h-44 w-44 grid-cols-8 gap-0.5 rounded-2xl bg-white p-3 ring-1 ring-ink-200" aria-label={t('payment.sampleQr')}>
              {Array.from({ length: 64 }).map((_, i) => <span key={i} className={((i * 37) % 7) < 3 || [0, 1, 8, 9, 6, 7, 14, 15, 48, 49, 56, 57].includes(i) ? 'bg-ink-900' : 'bg-white'} />)}
            </div>
          )}
          <div className="flex items-center justify-between text-sm"><span className="text-ink-500">{t('payment.status')}</span><StatusBadge status={p.status} /></div>
          <div className="flex items-center justify-between text-sm"><span className="text-ink-500">{t('payment.reference')}</span><span dir="ltr" className="font-mono text-xs">{p.provider_ref}</span></div>
          {p.status === 'pending' ? (
            <>
              <p className="text-sm text-ink-600">{t('payment.simulateHelp')}</p>
              <div className="grid gap-2">
                <Button variant="success" size="lg" icon="check" loading={busy === 'succeeded'} disabled={!!busy} onClick={() => simulate('succeeded')}>{t('payment.simulateSuccess')}</Button>
                <Button variant="danger" loading={busy === 'failed'} disabled={!!busy} onClick={() => simulate('failed')}>{t('payment.simulateFailure')}</Button>
              </div>
            </>
          ) : p.status === 'succeeded' ? (
            <Button className="w-full" onClick={() => navigate(`/bookings/${p.booking_id}`)}>{t('payment.backToBooking')}</Button>
          ) : (
            <>
              <Notice tone="error">{t('payment.failed')}</Notice>
              <Button className="w-full" onClick={() => navigate(`/bookings/${p.booking_id}`)}>{t('payment.backToBooking')}</Button>
            </>
          )}
          {err && <Notice tone="error">{err}</Notice>}
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-ink-500">{t('payment.realNote')}</p>
    </div>
  );
}
