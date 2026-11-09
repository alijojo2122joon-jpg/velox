import { useT } from '../i18n';
import { Link } from '../lib/router';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useFormat } from '../lib/format';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/Layout';
import { Badge, ButtonLink, Card, Empty, PageLoader, Seg, Stat } from '../components/ui';
import { useState } from 'react';
import { StudentCardSteps } from '../components/Campus';
import { VehicleCard, type VehicleSummary } from '../components/VehicleCard';

export function Universities() {
  const t = useT();
  const { num } = useFormat();
  const { data, loading } = useApi<{ items: any[] }>('/api/universities');
  if (loading) return <PageLoader />;
  const byCity = new Map<string, any[]>();
  for (const u of data?.items ?? []) byCity.set(u.city_name, [...(byCity.get(u.city_name) ?? []), u]);
  return (
    <div className="container-x py-8 sm:py-10">
      <PageHeader title={t('unis.title')} subtitle={t('unis.subtitle')} />
      <div className="space-y-10">
        {[...byCity.entries()].map(([city, unis]) => (
          <section key={city}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Icon name="pin" size={18} />{city}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {unis.map((u) => (
                <Link key={u.id} to={`/universities/${u.slug}`} className="card flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon name="graduation" size={24} /></span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{u.short_name}</div><div className="truncate text-sm text-ink-500">{u.name}</div>
                    <div className="mt-1 flex gap-3 text-xs font-semibold text-ink-600"><span>{t('unis.vehicles', { n: num(u.vehicle_count) })}</span><span>{t('unis.members', { n: num(u.member_count) })}</span></div></div>
                  <Icon name="chevronRight" className="text-ink-300" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-ink-500">{t('unis.openToAll')}</p>
    </div>
  );
}

export function UniversityDetail({ slug }: { slug: string }) {
  const t = useT();
  const { num } = useFormat();
  const { user } = useAuth();
  const { data, loading, error } = useApi<any>(`/api/universities/${slug}`, [slug]);
  const uniId = data?.university.id;
  const [campusOnly, setCampusOnly] = useState<'all' | 'campus'>('all');
  const vehicles = useApi<{ items: VehicleSummary[]; total: number }>(uniId ? `/api/vehicles?universityId=${uniId}&sort=nearest${campusOnly === 'campus' ? '&studentsOnly=1' : ''}` : null, [uniId, campusOnly]);
  if (loading) return <PageLoader />;
  if (error || !data) return <div className="container-x py-20"><Empty icon="graduation" title={t('unis.notFound')} /></div>;
  const u = data.university, s = data.stats;
  const isMember = user?.university_id === u.id;
  return (
    <div className="container-x py-8 sm:py-10">
      <PageHeader back={{ to: '/universities', label: t('nav.universities') }}
        title={<span className="flex flex-wrap items-center gap-3">{u.name}{isMember && <Badge tone="green" icon="check">{user?.university_verified ? t('unis.verifiedMember') : t('unis.member')}</Badge>}</span>}
        subtitle={`${u.short_name} · ${u.city_name}`}
        actions={<ButtonLink to={`/search?universityId=${u.id}&sort=nearest`} variant="brand" icon="map">{t('unis.viewMap')}</ButtonLink>} />
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label={t('unis.stats.students')} value={num(s.registered_students)} icon="users" hint={t('unis.stats.verified', { n: num(s.verified_members) })} />
        <Stat label={t('unis.stats.bicycles')} value={num(s.bicycles)} icon="bike" tone="green" />
        <Stat label={t('unis.stats.motorcycles')} value={num(s.motorcycles)} icon="moto" tone="amber" />
        <Stat label={t('unis.stats.active')} value={num(s.active_rentals)} icon="play" tone="violet" />
        <Stat label={t('unis.stats.completed')} value={num(s.completed_bookings)} icon="check" />
      </div>
      {!isMember && user && <Card className="mb-8 flex flex-wrap items-center gap-4 p-5"><Icon name="graduation" className="text-brand-600" /><span className="flex-1 text-sm">{t('unis.joinHint')}</span><ButtonLink to="/account" variant="secondary" size="sm">{t('unis.join')}</ButtonLink></Card>}
      <Card className="glow mb-10 p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><div className="eyebrow">{t('campus.eyebrow')}</div><h2 className="mt-1 text-2xl font-black">{t('campus.title')}</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">{t('campus.intro', { uni: u.short_name })}</p></div>
        </div>
        <StudentCardSteps universityId={u.id} universityName={u.short_name} />
      </Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black">{t('unis.nearCampus')}</h2>
        <Seg value={campusOnly} onChange={setCampusOnly} size="sm" items={[{ value: 'all' as const, label: t('campus.all') }, { value: 'campus' as const, label: t('campus.badge') }]} />
      </div>
      {vehicles.data?.items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{vehicles.data.items.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
        : <Card><Empty icon="bike" title={t('unis.noVehicles')} action={<ButtonLink to="/register?role=owner" variant="primary">{t('nav.listVehicle')}</ButtonLink>} /></Card>}
    </div>
  );
}
