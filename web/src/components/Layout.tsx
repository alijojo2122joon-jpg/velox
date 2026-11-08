import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, navigate, useLocation } from '../lib/router';
import { useI18n, LOCALES, useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi, useInterval } from '../lib/hooks';
import { useFormat } from '../lib/format';
import { Icon } from './icons';
import { Avatar, cx } from './ui';
import { BRAND } from '../brand';
import { PHOTO_CREDITS } from '../photos';

export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)} dir="ltr">
      <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true">
        <defs><linearGradient id="vxlogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f95ff" /><stop offset="1" stopColor="#184bc6" /></linearGradient></defs>
        <rect width="64" height="64" rx="18" fill={light ? '#fff' : 'url(#vxlogo)'} />
        <rect x="1" y="1" width="62" height="31" rx="17" fill="#fff" opacity={light ? 0 : 0.14} />
        <g fill="none" stroke={light ? '#184bc6' : '#fff'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="19" cy="40" r="9" /><circle cx="45" cy="40" r="9" />
          <path d="M19 40l8-15h12l6 15M27 25l5 15h-13M36 19h6" />
        </g>
        <circle cx="45" cy="17" r="4" fill={light ? '#7cc625' : '#c8ec6a'} />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={cx('font-display text-[19px] font-extrabold tracking-[0.08em]', light ? 'text-white' : 'text-ink-900')}>BALI BIKE</span>
        <span className={cx('mt-0.5 hidden whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-[0.2em] min-[420px]:block', light ? 'text-brand-200' : 'text-brand-600')}>Bicycle Reservation</span>
      </span>
    </span>
  );
}

function useClickOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [onOut]);
  return ref;
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const current = LOCALES.find((l) => l.code === locale)!;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-label={t('nav.language')} aria-expanded={open}
        className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-100">
        <Icon name="globe" size={18} />{compact ? current.short : current.label}<Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-52 animate-fade-up overflow-hidden rounded-2xl bg-white/90 p-1.5 shadow-lift ring-1 ring-white backdrop-blur-xl">
          {LOCALES.map((l) => (
            <button key={l.code} onClick={() => { setLocale(l.code); setOpen(false); }} dir={l.dir}
              className={cx('flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-sm transition hover:bg-ink-50', l.code === locale && 'bg-brand-50 font-semibold text-brand-700')}>
              <span>{l.label}</span><span className="text-xs text-ink-400">{l.short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** In-app notifications. Text is rendered from locale files using the structured payload. */
function NotificationBell() {
  const t = useT();
  const { relative } = useFormat();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const { data, reload } = useApi<{ items: any[]; unread: number }>('/api/notifications');
  useInterval(reload, 30_000);
  const openItem = async (n: any) => {
    setOpen(false);
    if (!n.read_at) await api.post(`/api/notifications/${n.id}/read`).catch(() => {});
    reload();
    if (n.link) navigate(n.link);
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-label={t('nav.notifications')} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-700 hover:bg-ink-100">
        <Icon name="bell" />
        {!!data?.unread && <span className="absolute end-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute -end-12 z-50 mt-2 w-[min(92vw,380px)] animate-fade-up overflow-hidden rounded-2xl bg-white/90 shadow-lift ring-1 ring-white backdrop-blur-xl sm:end-0">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <span className="font-bold">{t('notifications.title')}</span>
            {!!data?.unread && <button onClick={async () => { await api.post('/api/notifications/read-all'); reload(); }} className="text-xs font-semibold text-brand-600 hover:underline">{t('notifications.markAll')}</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!data?.items.length && <div className="px-4 py-10 text-center text-sm text-ink-500">{t('notifications.empty')}</div>}
            {data?.items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={cx('flex w-full gap-3 border-b border-ink-50 px-4 py-3 text-start transition hover:bg-ink-50', !n.read_at && 'bg-brand-50/40')}>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand-500')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-900">{t(`notifications.types.${n.type}.title`, n.payload)}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-500">{t(`notifications.types.${n.type}.body`, { ...n.payload, type: n.payload.type ? t(`verification.types.${n.payload.type}`) : '' })}</span>
                  <span className="mt-1 block text-xs text-ink-400">{relative(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const t = useT();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  if (!user) return null;
  const items = [
    { to: '/dashboard', icon: 'calendar', label: t('nav.myBookings') },
    ...(user.role !== 'renter' ? [{ to: '/dashboard/owner', icon: 'chart', label: t('nav.ownerDashboard') }] : []),
    { to: '/messages', icon: 'chat', label: t('nav.messages') },
    { to: '/account', icon: 'settings', label: t('nav.account') },
    ...(user.role === 'admin' ? [{ to: '/admin', icon: 'shield', label: t('nav.admin') }] : []),
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full p-0.5 pe-2 ring-1 ring-ink-200 transition hover:shadow-card" aria-expanded={open}>
        <Avatar name={user.full_name} url={user.avatar_url} size={34} />
        <Icon name="menu" size={18} className="text-ink-600" />
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-64 animate-fade-up overflow-hidden rounded-2xl bg-white/90 p-1.5 shadow-lift ring-1 ring-white backdrop-blur-xl">
          <div className="px-3 py-2.5">
            <div className="truncate text-sm font-bold">{user.full_name}</div>
            <div className="truncate text-xs text-ink-500">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-ink-100" />
          {items.map((i) => (
            <Link key={i.to} to={i.to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50">
              <Icon name={i.icon} size={18} className="text-ink-500" />{i.label}
            </Link>
          ))}
          <div className="my-1 h-px bg-ink-100" />
          <button onClick={async () => { setOpen(false); await logout(); navigate('/'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <Icon name="logout" size={18} className="text-ink-500" />{t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const t = useT();
  const { user } = useAuth();
  const { path } = useLocation();
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setMobile(false), [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const links = [
    { to: '/search?category=bicycle&region=bali', label: t('nav.bicycles'), match: 'bicycle' },
    { to: '/search?category=motorcycle&region=bali', label: t('nav.motorcycles'), match: 'motorcycle' },
    { to: '/universities', label: t('nav.universities'), match: '/universities' },
  ];
  return (
    <header className={cx('sticky top-0 z-[500] border-b backdrop-blur-2xl backdrop-saturate-150 transition-all duration-500',
      scrolled ? 'border-ink-200/70 bg-white/75 shadow-[0_10px_30px_-18px_rgb(15_40_90/0.35)]' : 'border-transparent bg-white/30')}>
      <div className="container-x flex h-16 items-center gap-4">
        <Link to="/" aria-label={BRAND.name}><Logo /></Link>
        <nav className="ms-6 hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={cx('group relative rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors hover:text-ink-950',
              (path + window.location.search).includes(l.match) ? 'text-ink-950' : 'text-ink-600')}>{l.label}
              <span className={cx('absolute inset-x-3.5 -bottom-0.5 h-[2px] origin-center rounded-full bg-brand-500 transition-transform duration-300 group-hover:scale-x-100',
                (path + window.location.search).includes(l.match) ? 'scale-x-100' : 'scale-x-0')} /></Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <Link to={user && user.role !== 'renter' ? '/dashboard/owner/vehicles/new' : user ? '/account?become=owner' : '/register?role=owner'}
            className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-ink-800 transition hover:bg-ink-100 md:block">{t('nav.listVehicle')}</Link>
          <div className="hidden sm:block"><LanguageSwitcher compact /></div>
          {user ? (<><NotificationBell /><UserMenu /></>) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="rounded-xl px-3.5 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-100">{t('nav.login')}</Link>
              <Link to="/register" className="shine rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgb(10_22_48/0.6)] transition hover:-translate-y-0.5 hover:bg-brand-600">{t('nav.signup')}</Link>
            </div>
          )}
          <button className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-ink-100 lg:hidden" onClick={() => setMobile(!mobile)} aria-label={t('nav.menu')}>
            <Icon name={mobile ? 'x' : 'menu'} />
          </button>
        </div>
      </div>
      {mobile && (
        <div className="animate-fade-in border-t border-white/60 bg-white/80 backdrop-blur-xl lg:hidden">
          <div className="container-x space-y-1 py-4">
            {links.map((l) => <Link key={l.to} to={l.to} className="block rounded-xl px-3 py-3 font-semibold hover:bg-ink-50">{l.label}</Link>)}
            <Link to={user && user.role !== 'renter' ? '/dashboard/owner/vehicles/new' : '/register?role=owner'} className="block rounded-xl px-3 py-3 font-semibold hover:bg-ink-50">{t('nav.listVehicle')}</Link>
            <div className="flex items-center justify-between px-1 pt-2"><LanguageSwitcher />
              {!user && <div className="flex gap-2">
                <Link to="/login" className="rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-ink-200">{t('nav.login')}</Link>
                <Link to="/register" className="rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white">{t('nav.signup')}</Link>
              </div>}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="relative mt-28 overflow-hidden bg-ink-950 text-ink-300">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent bg-[length:200%_100%] animate-[grad-shift_6s_ease-in-out_infinite]" />
      <div aria-hidden="true" className="aurora aurora-dark opacity-60"><i /><i /><i /></div>
      <div className="container-x relative grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">{t('footer.about')}</p>
          <div className="mt-5"><span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-ink-300 ring-1 ring-white/10">{t('footer.mvp')}</span></div>
        </div>
        <div>
          <div className="text-sm font-bold text-white">{t('footer.explore')}</div>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link className="transition hover:text-white" to="/search?category=bicycle&region=bali">{t('nav.bicycles')}</Link></li>
            <li><Link className="transition hover:text-white" to="/search?category=motorcycle&region=bali">{t('nav.motorcycles')}</Link></li>
            <li><Link className="transition hover:text-white" to="/universities">{t('nav.universities')}</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-bold text-white">{t('footer.company')}</div>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link className="transition hover:text-white" to="/register?role=owner">{t('nav.listVehicle')}</Link></li>
            <li><Link className="transition hover:text-white" to="/trust">{t('footer.trust')}</Link></li>
            <li><Link className="transition hover:text-white" to="/terms">{t('footer.terms')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {BRAND.name} · {t('brand.tagline')}</span>
          <span>{t('footer.demoNote')} · <a href="https://unsplash.com/license" target="_blank" rel="noreferrer" className="underline hover:text-white" title={PHOTO_CREDITS.join(', ')}>{t('footer.photos')}</a></span>
        </div>
      </div>
    </footer>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-8">
      {back && <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"><Icon name="arrowLeft" size={16} />{back.label}</Link>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
