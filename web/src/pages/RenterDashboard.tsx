import { useT } from '../i18n';
import { useLocation, setSearch, Link } from '../lib/router';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useFormat } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { BookingList } from '../components/BookingList';
import { ButtonLink, Card, DemoBadge, Empty, Notice, PageLoader, Stat, StatusBadge, Tabs } from '../components/ui';
import { VehicleCard } from '../components/VehicleCard';

type Tab = 'upcoming' | 'history' | 'saved' | 'payments' | 'reviews';

export function RenterDashboard() {
  const t = useT();
  const { user } = useAuth();
  const { money, dateTime, num } = useFormat();
  const { search } = useLocation();
  const tab = (search.get('tab') as Tab) ?? 'upcoming';
  const { data, loading } = useApi<{ items: any[] }>('/api/bookings?as=renter');
  const saved = useApi<{ items: any[] }>(tab === 'saved' ? '/api/me/saved' : null, [tab]);
  const payments = useApi<{ items: any[] }>(tab === 'payments' ? '/api/me/payments' : null, [tab]);

  if (loading || !data) return <PageLoader />;
  const current = data.items.filter((b) => ['pending', 'accepted', 'confirmed', 'active'].includes(b.status));
  const past = data.items.filter((b) => !['pending', 'accepted', 'confirmed', 'active'].includes(b.status));
  const toReview = past.filter((b) => b.status === 'completed' && !b.reviewed);
  const spent = past.filter((b) => b.status === 'completed').reduce((s, b) => s + b.subtotal, 0);
  const missingVerification = !user!.email_verified_at || !user!.phone_verified_at;

  return (
    <div className="container-x py-8 sm:py-10">
      <PageHeader title={t('dashboard.renter.title', { name: user!.full_name.split(' ')[0] })} subtitle={t('dashboard.renter.subtitle')}
        actions={<ButtonLink to="/search" variant="brand" icon="search">{t('dashboard.renter.find')}</ButtonLink>} />

      {missingVerification && <div className="mb-6"><Notice tone="info" title={t('dashboard.verifyTitle')} action={<Link to="/account" className="shrink-0 text-sm font-bold text-brand-700 underline">{t('dashboard.verifyCta')}</Link>}>{t('dashboard.verifyBody')}</Notice></div>}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('dashboard.renter.active')} value={num(current.filter((b) => b.status === 'active').length)} icon="bike" tone="green" />
        <Stat label={t('dashboard.renter.upcoming')} value={num(current.filter((b) => b.status !== 'active').length)} icon="calendar" />
        <Stat label={t('dashboard.renter.completed')} value={num(past.filter((b) => b.status === 'completed').length)} icon="check" tone="violet" />
        <Stat label={t('dashboard.renter.spent')} value={money(spent)} icon="wallet" tone="amber" />
      </div>

      <div className="mb-6"><Tabs value={tab} onChange={(v) => setSearch({ tab: v })} items={[
        { value: 'upcoming', label: t('dashboard.renter.tabs.upcoming'), count: current.length },
        { value: 'history', label: t('dashboard.renter.tabs.history') },
        { value: 'reviews', label: t('dashboard.renter.tabs.reviews'), count: toReview.length },
        { value: 'saved', label: t('dashboard.renter.tabs.saved') },
        { value: 'payments', label: t('dashboard.renter.tabs.payments') },
      ]} /></div>

      {tab === 'upcoming' && <BookingList items={current} as="renter" emptyTitle={t('dashboard.renter.noUpcoming')} emptyBody={t('dashboard.renter.noUpcomingBody')}
        emptyAction={<ButtonLink to="/search" variant="primary">{t('dashboard.renter.find')}</ButtonLink>} />}
      {tab === 'history' && <BookingList items={past} as="renter" emptyTitle={t('dashboard.renter.noHistory')} />}
      {tab === 'reviews' && <BookingList items={toReview} as="renter" emptyTitle={t('dashboard.renter.noReviews')} />}
      {tab === 'saved' && (saved.loading ? <PageLoader /> : saved.data?.items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{saved.data.items.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
      ) : <Card><Empty icon="heart" title={t('dashboard.renter.noSaved')} /></Card>)}
      {tab === 'payments' && (payments.loading ? <PageLoader /> : payments.data?.items.length ? (
        <Card className="divide-y divide-ink-100">
          {payments.data.items.map((p) => (
            <Link key={p.id} to={`/bookings/${p.booking_id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink-50">
              <div><div className="font-semibold">{t(`payment.methods.${p.method}`)} {p.purpose === 'extension' && `· ${t('booking.extension')}`} {!!p.is_test && <DemoBadge />}</div>
                <div className="text-xs text-ink-500"><span dir="ltr">{p.booking_code}</span> · {dateTime(p.created_at)}</div></div>
              <div className="flex items-center gap-3"><span className="font-bold">{money(p.amount)}</span><StatusBadge status={p.status} /></div>
            </Link>
          ))}
        </Card>
      ) : <Card><Empty icon="wallet" title={t('dashboard.renter.noPayments')} /></Card>)}
    </div>
  );
}
