import { Link } from '../lib/router';
import { useT } from '../i18n';
import { useFormat } from '../lib/format';
import { Icon } from './icons';
import { Badge, DemoBadge, Stars, cx } from './ui';

export interface VehicleSummary {
  id: number; name: string; brand: string; model: string; category: 'bicycle' | 'motorcycle'; type: string; condition?: string;
  cover_url: string | null; rating_avg: number; rating_count: number; is_demo: number; city_name?: string; university_name?: string | null;
  owner_name?: string; owner_verified?: boolean; distance_km?: number | null; instant_book?: number; deposit?: number;
  from_price: { duration_minutes: number; price: number } | null; quote?: { subtotal: number; billedMinutes: number } | null; lat?: number; lng?: number;
}

export function VehicleCard({ v, highlighted, onHover, compact }: { v: VehicleSummary; highlighted?: boolean; onHover?: (id: number | null) => void; compact?: boolean }) {
  const t = useT();
  const { money, duration, km } = useFormat();
  return (
    <Link to={`/vehicles/${v.id}`} onMouseEnter={() => onHover?.(v.id)} onMouseLeave={() => onHover?.(null)}
      className={cx('group block animate-fade-up overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-900/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        highlighted && 'ring-2 ring-brand-500')}>
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
        {v.cover_url && <img src={v.cover_url} alt={v.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <Badge tone="dark" icon={v.category === 'bicycle' ? 'bike' : 'moto'} className="bg-ink-900/85 backdrop-blur">{t(`vehicleTypes.${v.type}`)}</Badge>
          {!!v.is_demo && <DemoBadge />}
        </div>
        {v.distance_km != null && (
          <span className="absolute bottom-3 start-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-ink-800 shadow-sm">
            <Icon name="pin" size={13} />{km(v.distance_km)}
          </span>
        )}
        {v.category === 'motorcycle' && <span className="absolute bottom-3 end-3 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950">{t('vehicle.licenseRequired')}</span>}
      </div>
      <div className={cx('p-4', compact && 'p-3.5')}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-bold text-ink-900">{v.name}</h3>
          <Stars value={v.rating_avg} count={v.rating_count} />
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-ink-500">
          {v.brand} {v.model}{v.university_name ? ` · ${v.university_name}` : v.city_name ? ` · ${v.city_name}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          {v.quote ? (
            <div><span className="text-lg font-extrabold text-ink-900">{money(v.quote.subtotal)}</span>
              <span className="ms-1 text-sm text-ink-500">{t('vehicle.total')}</span></div>
          ) : v.from_price ? (
            <div><span className="text-xs text-ink-500">{t('vehicle.from')} </span><span className="text-lg font-extrabold text-ink-900">{money(v.from_price.price)}</span>
              <span className="whitespace-nowrap text-sm text-ink-500"> / {duration(v.from_price.duration_minutes)}</span></div>
          ) : <span />}
          {!!v.instant_book && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600"><Icon name="bolt" size={14} filled />{t('vehicle.instant')}</span>}
        </div>
      </div>
    </Link>
  );
}

export function VehicleCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-900/5">
      <div className="aspect-[4/3] animate-pulse bg-ink-100" />
      <div className="space-y-2 p-4"><div className="h-4 w-3/4 animate-pulse rounded bg-ink-100" /><div className="h-3 w-1/2 animate-pulse rounded bg-ink-100" /><div className="h-5 w-1/3 animate-pulse rounded bg-ink-100" /></div>
    </div>
  );
}
