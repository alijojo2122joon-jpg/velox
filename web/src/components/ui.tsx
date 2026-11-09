import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './icons';
import { Link } from '../lib/router';
import { useT } from '../i18n';
import { ApiError } from '../lib/api';
import { useFormat } from '../lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ───────── Button ─────────
type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-ink-950 text-white hover:bg-ink-800',
  brand: 'bg-brand-600 text-white hover:bg-brand-500 shadow-[0_8px_20px_-12px_rgb(0_113_227/0.7)]',
  secondary: 'bg-ink-100 text-ink-950 hover:bg-ink-200',
  ghost: 'text-brand-600 hover:bg-brand-50',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  success: 'bg-[#34c759] text-white hover:brightness-105',
};
const sizes = { sm: 'h-9 px-4 text-sm rounded-full gap-1.5', md: 'h-11 px-5 text-[15px] rounded-full gap-2', lg: 'h-13 px-7 text-[17px] rounded-full gap-2' };

export function Button({ variant = 'primary', size = 'md', loading, icon, iconEnd, className, children, disabled, ...rest }:
  { variant?: Variant; size?: keyof typeof sizes; loading?: boolean; icon?: string; iconEnd?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button disabled={disabled || loading}
      className={cx('inline-flex select-none items-center justify-center font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]',
        variants[variant], sizes[size], className)} {...rest}>
      {loading ? <Spinner size={16} /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      {iconEnd && !loading && <Icon name={iconEnd} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', size = 'md', icon, iconEnd, className, children }:
  { to: string; variant?: Variant; size?: keyof typeof sizes; icon?: string; iconEnd?: string; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cx('group/btn inline-flex items-center justify-center font-semibold transition-all duration-300 active:scale-[0.98]', variants[variant], sizes[size], className)}>
      {icon && <Icon name={icon} size={18} />}{children}{iconEnd && <Icon name={iconEnd} size={18} className="transition-transform duration-300 group-hover/btn:translate-x-1 rtl:group-hover/btn:-translate-x-1" />}
    </Link>
  );
}

export const Spinner = ({ size = 20, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// ───────── Form fields ─────────
export function Field({ label, error, hint, children, className }: { label?: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600"><Icon name="alert" size={14} />{error}</span>
        : hint ? <span className="mt-1.5 block text-[13px] text-ink-500">{hint}</span> : null}
    </label>
  );
}
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx('input', className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx('input', className)} {...p} />;
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select className={cx('input appearance-none pe-10', className)} {...p}>{children}</select>
    <Icon name="chevronDown" size={18} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400" />
  </div>
);

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-3 text-start text-sm font-medium text-ink-800">
      <span className={cx('relative h-7 w-[52px] shrink-0 overflow-hidden rounded-full p-[3px] transition-all duration-300', checked ? 'grass-track' : 'empty-track')}>
        <span className={cx('marble-knob absolute top-[3px] h-[22px] w-[22px] rounded-full transition-all duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]', checked ? 'start-[27px]' : 'start-[3px]')} />
      </span>
      {label}
    </button>
  );
}

// ───────── Display ─────────
const badgeTones = {
  gray: 'bg-ink-100 text-ink-700', blue: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', dark: 'bg-ink-900 text-white', violet: 'bg-violet-50 text-violet-700',
};
export function Badge({ tone = 'gray', icon, children, className }: { tone?: keyof typeof badgeTones; icon?: string; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', badgeTones[tone], className)}>
    {icon && <Icon name={icon} size={13} strokeWidth={2.2} />}{children}</span>;
}

/** Every piece of seeded demonstration content carries this label. */
export function DemoBadge({ className }: { className?: string }) {
  const t = useT();
  return <span title={t('demo.tooltip')} className={cx('inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800', className)}>{t('demo.label')}</span>;
}

export const STATUS_TONE: Record<string, keyof typeof badgeTones> = {
  pending: 'amber', accepted: 'blue', confirmed: 'violet', active: 'green', completed: 'gray', rejected: 'red', cancelled: 'red', expired: 'gray',
  approved: 'green', paused: 'amber', maintenance: 'amber', suspended: 'red', pending_review: 'amber', succeeded: 'green', failed: 'red',
  refunded: 'gray', partially_refunded: 'gray', open: 'amber', reviewing: 'blue', resolved: 'green', dismissed: 'gray', resolved_owner: 'green', resolved_renter: 'green', closed: 'gray',
};
export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{t(`status.${status}`)}</Badge>;
}

export function Avatar({ name, url, size = 40 }: { name?: string | null; url?: string | null; size?: number }) {
  const initials = (name ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return url
    ? <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-soft to-brand-200 font-bold text-brand-800 ring-2 ring-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>;
}

export function Stars({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  const { num } = useFormat();
  if (!count) return <span className="inline-flex items-center gap-1 text-sm text-ink-500"><Icon name="star" size={size} />—</span>;
  return <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink-800"><Icon name="star" size={size} filled className="text-amber-400" />{num(value, 1)}<span className="font-normal text-ink-500">({count})</span></span>;
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('card', className)} {...rest}>{children}</div>;
}

export function Stat({ label, value, icon, hint, tone = 'blue' }: { label: string; value: ReactNode; icon?: string; hint?: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'violet' }) {
  const tones = { blue: 'text-brand-600', green: 'text-[#34c759]', amber: 'text-amber-500', violet: 'text-violet-500' };
  return (
    <Card className="spotlight group p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-500">{label}</div>
          <div className="mt-1.5 break-words text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{value}</div>
          {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
        </div>
        {icon && <span className={cx('neu-icon hidden h-11 w-11 shrink-0 sm:inline-flex', tones[tone])}><Icon name={icon} /></span>}
      </div>
    </Card>
  );
}

export function Empty({ icon = 'search', title, body, action }: { icon?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="neu-icon mb-5 h-16 w-16"><Icon name={icon} size={26} /></span>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-ink-200/60', className)} />;
}

/** Glowing dial loader (reference: thermostat ring). */
export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-busy="true">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 animate-[spin-slow_1.2s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,transparent_0_55%,#5596ff_80%,#22d3ee_100%)]" />
        <div className="absolute inset-0 animate-ping rounded-full bg-brand-400/20" />
        <div className="step-disc absolute inset-[5px] flex items-center justify-center rounded-full">
          <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#2b76ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><circle cx="19" cy="40" r="9" /><circle cx="45" cy="40" r="9" /><path d="M19 40l8-15h12l6 15M27 25l5 15h-13" /></g></svg>
        </div>
      </div>
    </div>
  );
}

/** Raised disc with coloured arc ring, used for numbered steps. */
export function StepDisc({ n, color = '#2b76ff', size = 56, children }: { n?: string; color?: string; size?: number; children?: ReactNode }) {
  return (
    <span className="step-ring relative inline-flex shrink-0 items-center justify-center rounded-full p-[3px]" style={{ width: size, height: size, ['--ring' as any]: color, filter: `drop-shadow(0 0 6px ${color}66)` }}>
      <span className="step-disc flex h-full w-full items-center justify-center rounded-full font-display text-lg font-semibold" style={{ color }}>{children ?? n}</span>
    </span>
  );
}

export function Notice({ tone = 'info', title, children, icon, action }: { tone?: 'info' | 'warn' | 'error' | 'success' | 'demo'; title?: ReactNode; children?: ReactNode; icon?: string; action?: ReactNode }) {
  const tones = {
    info: 'bg-brand-50/80 text-brand-900 ring-brand-200/70', warn: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-900 ring-red-200', success: 'bg-emerald-50 text-emerald-900 ring-emerald-200', demo: 'bg-amber-50 text-amber-900 ring-amber-300 ring-dashed',
  };
  const icons = { info: 'info', warn: 'alert', error: 'alert', success: 'check', demo: 'sparkle' };
  return (
    <div className={cx('flex gap-3 rounded-xl p-4 text-sm ring-1 ring-inset', tones[tone])}>
      <Icon name={icon ?? icons[tone]} size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)}
          className={cx('flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
            value === it.value ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_8px_20px_-8px_rgb(43_118_255/0.6)]' : 'text-ink-600 hover:bg-white/70')}>
          {it.label}
          {!!it.count && <span className={cx('rounded-full px-1.5 text-[11px]', value === it.value ? 'bg-white/25' : 'bg-white text-ink-700 shadow-sm')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('relative flex max-h-[92vh] w-full animate-fade-up flex-col rounded-t-3xl bg-white/95 shadow-lift backdrop-blur-xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ───────── Toasts ─────────
type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[2000] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto flex max-w-md animate-fade-up items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lift',
            t.tone === 'error' ? 'bg-red-600' : 'glass-dark')}>
            <Icon name={t.tone === 'error' ? 'alert' : 'check'} size={18} className={t.tone === 'success' ? 'text-emerald-400' : ''} />{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Translate an API error into the user's language. */
export function useErrorText() {
  const t = useT();
  return (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'INTERNAL';
    const key = `errors.${code}`;
    const s = t(key);
    return s === key ? t('errors.INTERNAL') : s;
  };
}
/** Field-level validation messages from an API error. */
export function useFieldErrors() {
  const t = useT();
  return (e: unknown): Record<string, string> => {
    if (!(e instanceof ApiError)) return {};
    return Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, t(`validation.${v}`)]));
  };
}
