import { useT } from '../i18n';
import { Link } from '../lib/router';
import { useFormat } from '../lib/format';
import { Icon } from './icons';
import { DemoBadge, Empty, StatusBadge, Badge } from './ui';

export function BookingRow({ b, as }: { b: any; as: 'renter' | 'owner' }) {
  const t = useT();
  const { money, dateTime } = useFormat();
  const href = as === 'owner' ? `/dashboard/owner/bookings/${b.id}` : `/bookings/${b.id}`;
  const needsAction = (as === 'owner' && b.status === 'pending') || (as === 'renter' && b.status === 'accepted') ||
    (b.status === 'completed' && !b.reviewed);
  return (
    <Link to={href} className="card flex items-center gap-4 p-3 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-4">
      {b.cover_url && <img src={b.cover_url} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover sm:h-18 sm:w-24" loading="lazy" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-bold">{b.vehicle_name}</span>
          <StatusBadge status={b.status} />{!!b.is_demo && <DemoBadge />}
          {needsAction && <Badge tone="blue" icon="bell">{b.status === 'completed' ? t('booking.leaveReview') : t('booking.actionNeeded')}</Badge>}
        </div>
        <div className="mt-0.5 truncate text-sm text-ink-500">
          {dateTime(b.start_at, b.utc_offset_minutes)} → {dateTime(b.end_at, b.utc_offset_minutes)}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-400"><span dir="ltr">{b.code}</span> · {as === 'owner' ? b.renter_name : b.owner_name} · {b.city_name}</div>
      </div>
      <div className="hidden text-end sm:block"><div className="font-bold">{money(b.total)}</div></div>
      <Icon name="chevronRight" size={18} className="text-ink-300" />
    </Link>
  );
}

export function BookingList({ items, as, emptyTitle, emptyBody, emptyAction }: { items: any[]; as: 'renter' | 'owner'; emptyTitle: string; emptyBody?: string; emptyAction?: React.ReactNode }) {
  if (!items.length) return <div className="card"><Empty icon="calendar" title={emptyTitle} body={emptyBody} action={emptyAction} /></div>;
  return <div className="space-y-3">{items.map((b) => <BookingRow key={b.id} b={b} as={as} />)}</div>;
}
