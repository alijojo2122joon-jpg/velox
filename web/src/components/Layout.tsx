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
import { PHOTO_CREDITS, BACKDROPS } from '../photos';

export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)} dir="ltr">
      <span className="tile flex h-[42px] w-[42px] items-center justify-center rounded-[14px]">
        <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
          <g fill="none" stroke="#1f66e0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="41" r="10" /><circle cx="46" cy="41" r="10" />
            <path d="M18 41l9-17h12l7 17M27 24l5 17H18M36 17h7" />
          </g>
        </svg>
      </span>
      <span className={cx('flex flex-col leading-none', light ? 'text-white' : 'text-ink-950')}>
        <b className="wordmark text-[15px]">BALI BIKE</b>
        <small className={cx('wordmark-sub mt-[3px] hidden min-[420px]:block', light ? 'text-ink-300' : 'text-ink-500')}>RESERVATION</small>
      </span>
    </span>
  );
}

/* Deterministic light particles (position %, size px, float duration s, delay s) for the middle depth layer. */
const BOKEH = [
  [8, 18, 160, 13, 0], [22, 62, 90, 17, -4], [35, 28, 60, 11, -2], [48, 78, 140, 19, -8], [60, 12, 70, 15, -6], [72, 52, 180, 21, -3],
  [84, 30, 80, 12, -9], [92, 72, 110, 16, -5], [15, 88, 70, 14, -7], [55, 40, 50, 10, -1], [40, 95, 120, 18, -10], [78, 90, 60, 13, -11],
];

/**
 * Living backdrop in three depths: Bali bicycle photos cross-fading slowly (far), floating light particles (middle) and
 * a soft light that follows the pointer or the phone's tilt (near). Each depth moves a different amount, so the page
 * feels deep. Taps and clicks send out a light wave. Everything moves with GPU transforms/opacity only (no per-frame
 * repaints or filters), and animation pauses while the tab is hidden.
 */
export function PageBackdrop() {
  const root = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setSlide((i) => (i + 1) % BACKDROPS.length); }, 9000);
    BACKDROPS.forEach((b) => { const im = new Image(); im.src = b.src; });
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const target = { x: 0.5, y: 0.4 }, cur = { x: 0.5, y: 0.4 };
    let raf = 0, idleT = 0, wanderI = 0;
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.07;
      cur.y += (target.y - cur.y) * 0.07;
      const dx = 0.5 - cur.x, dy = 0.5 - cur.y;
      el.style.setProperty('--fx', `${(dx * 40).toFixed(1)}px`); el.style.setProperty('--fy', `${(dy * 30).toFixed(1)}px`);
      el.style.setProperty('--mx', `${(dx * 110).toFixed(1)}px`); el.style.setProperty('--my', `${(dy * 80).toFixed(1)}px`);
      el.style.setProperty('--lx', `${(cur.x * innerWidth).toFixed(0)}px`); el.style.setProperty('--ly', `${(cur.y * innerHeight).toFixed(0)}px`);
      raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.0008 ? requestAnimationFrame(tick) : 0;
    };
    const aim = (x: number, y: number) => { target.x = x; target.y = y; if (!raf) raf = requestAnimationFrame(tick); };
    const wake = () => {
      clearInterval(wanderI); clearTimeout(idleT);
      // No input for a while: the light wanders on its own so the page never looks frozen.
      idleT = window.setTimeout(() => { wanderI = window.setInterval(() => {
        if (document.hidden) return;
        const t = performance.now() / 5000; aim(0.5 + Math.sin(t) * 0.3, 0.42 + Math.cos(t * 0.7) * 0.22);
      }, 200); }, 3500);
    };
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse') { aim(e.clientX / innerWidth, e.clientY / innerHeight); wake(); } };
    const onDown = (e: PointerEvent) => {
      aim(e.clientX / innerWidth, e.clientY / innerHeight); wake();
      const w = document.createElement('span');
      w.className = 'mbg-wave';
      w.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      el.appendChild(w);
      setTimeout(() => w.remove(), 1500);
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      aim(Math.min(1, Math.max(0, 0.5 + e.gamma / 50)), Math.min(1, Math.max(0, 0.4 + (e.beta - 45) / 80))); wake();
    };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true });
    addEventListener('deviceorientation', onTilt, { passive: true });
    wake(); tick();
    return () => {
      cancelAnimationFrame(raf); clearInterval(wanderI); clearTimeout(idleT);
      removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown); removeEventListener('deviceorientation', onTilt);
    };
  }, []);
  return (
    <div ref={root} className="mbg" aria-hidden="true">
      <div className="mbg-far">
        {BACKDROPS.map((b, i) => <i key={b.src} className={i === slide ? 'on' : ''} style={{ backgroundImage: `url(${b.src})`, animationDelay: `${-i * 9}s` }} />)}
      </div>
      <b />
      <div className="mbg-mid">
        {BOKEH.map(([x, y, s, d, dl], i) => <span key={i} style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDuration: `${d}s`, animationDelay: `${dl}s` }} />)}
      </div>
      <span className="mbg-light" />
    </div>
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
    <header className={cx('sticky top-0 z-[500] border-b transition-all duration-500',
      scrolled ? 'border-white/80 bg-white/92 shadow-[0_10px_30px_-18px_rgb(25_45_80/0.4)]' : 'border-transparent bg-transparent')}>
      <div className="container-x flex h-[70px] items-center gap-4">
        <Link to="/" aria-label={BRAND.name}><Logo /></Link>
        <nav className="ms-6 hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={cx('group relative rounded-xl px-3 py-2 text-sm font-bold transition-colors hover:text-ink-950',
              (path + window.location.search).includes(l.match) ? 'text-ink-950' : 'text-ink-600')}>{l.label}
              <span className={cx('absolute inset-x-3.5 -bottom-0.5 h-[2px] origin-center rounded-full bg-brand-500 transition-transform duration-300 group-hover:scale-x-100',
                (path + window.location.search).includes(l.match) ? 'scale-x-100' : 'scale-x-0')} /></Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <Link to={user && user.role !== 'renter' ? '/dashboard/owner/vehicles/new' : user ? '/account?become=owner' : '/register?role=owner'}
            className="hidden rounded-xl px-3 py-2 text-sm font-bold text-ink-700 transition hover:text-ink-950 md:block">{t('nav.listVehicle')}</Link>
          <div className="hidden sm:block"><LanguageSwitcher compact /></div>
          {user ? (<><NotificationBell /><UserMenu /></>) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="tile rounded-[13px] px-4 py-2 text-sm font-extrabold text-ink-900 transition hover:-translate-y-0.5">{t('nav.login')}</Link>
              <Link to="/register" className="cta rounded-[13px] px-4 py-2 text-sm font-extrabold">{t('nav.signup')}</Link>
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
    <footer className="container-x pb-6 text-[13px] text-ink-600"><div className="glass overflow-hidden">
      <div className="container-x relative grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm leading-relaxed text-ink-600">{t('footer.about')}</p>
          <div className="mt-5"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-600">{t('footer.mvp')}</span></div>
        </div>
        <div>
          <div className="font-semibold text-ink-950">{t('footer.explore')}</div>
          <ul className="mt-4 space-y-2.5">
            <li><Link className="transition hover:text-ink-950 hover:underline" to="/search?category=bicycle&region=bali">{t('nav.bicycles')}</Link></li>
            <li><Link className="transition hover:text-ink-950 hover:underline" to="/search?category=motorcycle&region=bali">{t('nav.motorcycles')}</Link></li>
            <li><Link className="transition hover:text-ink-950 hover:underline" to="/universities">{t('nav.universities')}</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-ink-950">{t('footer.company')}</div>
          <ul className="mt-4 space-y-2.5">
            <li><Link className="transition hover:text-ink-950 hover:underline" to="/register?role=owner">{t('nav.listVehicle')}</Link></li>
            <li><Link className="transition hover:text-ink-950 hover:underline" to="/trust">{t('footer.trust')}</Link></li>
            <li><Link className="transition hover:text-ink-950 hover:underline" to="/terms">{t('footer.terms')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-300/60">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {BRAND.name} · {t('brand.tagline')}</span>
          <span>{t('footer.demoNote')} · <a href="https://unsplash.com/license" target="_blank" rel="noreferrer" className="underline hover:text-ink-950" title={PHOTO_CREDITS.join(', ')}>{t('footer.photos')}</a></span>
        </div>
      </div>
    </div></footer>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-8">
      {back && <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"><Icon name="arrowLeft" size={16} />{back.label}</Link>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
