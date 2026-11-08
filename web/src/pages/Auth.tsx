import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Link, navigate, useLocation } from '../lib/router';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Icon } from '../components/icons';
import { Button, Field, Input, Notice, Select, cx, useErrorText, useFieldErrors } from '../components/ui';
import { Logo } from '../components/Layout';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: React.ReactNode; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="container-x grid min-h-[calc(100vh-4rem)] items-center gap-12 py-10 lg:grid-cols-2">
      <div className="mx-auto w-full max-w-md animate-fade-up">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-ink-500">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
      <div className="relative hidden h-full min-h-[560px] overflow-hidden rounded-[2rem] bg-ink-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -end-20 -top-20 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <Logo light />
        <div className="relative">
          <p className="font-display text-4xl font-extrabold leading-tight">{t('brand.tagline')}</p>
          <ul className="mt-8 space-y-4 text-ink-300">
            {['verified', 'checklist', 'payments'].map((k) => <li key={k} className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10"><Icon name="check" size={16} /></span>{t(`home.trustline.${k}`)}</li>)}
          </ul>
        </div>
        <span className="relative text-sm text-ink-400">{t('auth.sideNote')}</span>
      </div>
    </div>
  );
}

const nextUrl = (search: URLSearchParams, fallback = '/dashboard') => {
  const n = search.get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : fallback;
};

export function Login() {
  const { t } = useI18n();
  const { search } = useLocation();
  const { setUser } = useAuth();
  const errText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e?: FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/api/auth/login', creds ?? { email, password });
      setUser(r.user);
      navigate(nextUrl(search, r.user.role === 'admin' ? '/admin' : r.user.role === 'owner' ? '/dashboard/owner' : '/dashboard'), { replace: true });
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const demos = [
    { email: 'renter@velox.demo', role: 'renter' }, { email: 'owner@velox.demo', role: 'owner' }, { email: 'admin@velox.demo', role: 'admin' },
  ];

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={<>{t('auth.noAccount')} <Link to={`/register${search.get('next') ? `?next=${encodeURIComponent(search.get('next')!)}` : ''}`} className="font-semibold text-brand-600 hover:underline">{t('nav.signup')}</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.email')}><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t('auth.password')}><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {err && <Notice tone="error">{err}</Notice>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t('nav.login')}</Button>
      </form>
      <div className="mt-8 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
        <div className="text-sm font-bold text-amber-900">{t('auth.demoTitle')}</div>
        <p className="mt-0.5 text-xs text-amber-800">{t('auth.demoBody')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {demos.map((d) => (
            <button key={d.email} disabled={busy} onClick={() => submit(undefined, { email: d.email, password: 'Demo1234!' })}
              className="rounded-xl bg-white px-3 py-2.5 text-start text-sm font-semibold text-ink-800 ring-1 ring-amber-200 transition hover:ring-amber-400">
              {t(`auth.demoRoles.${d.role}`)}<span className="block truncate text-[11px] font-normal text-ink-500" dir="ltr">{d.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { t, locale } = useI18n();
  const { search } = useLocation();
  const { setUser } = useAuth();
  const errText = useErrorText();
  const fieldErrors = useFieldErrors();
  const { data: cities } = useApi<{ items: any[] }>('/api/locations/cities');
  const [role, setRole] = useState<'renter' | 'owner'>(search.get('role') === 'owner' ? 'owner' : 'renter');
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', cityId: '', universityId: '' });
  const { data: unis } = useApi<{ items: any[] }>(f.cityId ? `/api/universities?cityId=${f.cityId}` : null, [f.cityId]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().length < 2) e.fullName = t('validation.V_TOO_SHORT');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = t('validation.V_EMAIL');
    if (!/^(\+?62|0)8\d{7,12}$/.test(f.phone.replace(/[\s-]/g, ''))) e.phone = t('validation.V_PHONE');
    if (f.password.length < 8) e.password = t('validation.V_PASSWORD');
    setErrors(e);
    return !Object.keys(e).length;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/api/auth/register', { ...f, phone: f.phone.replace(/[\s-]/g, ''), role, locale,
        cityId: f.cityId ? Number(f.cityId) : undefined, universityId: f.universityId ? Number(f.universityId) : undefined });
      setUser(r.user);
      navigate(nextUrl(search, role === 'owner' ? '/dashboard/owner/vehicles/new' : '/search'), { replace: true });
    } catch (e) {
      setErrors(fieldErrors(e));
      if (!(e instanceof ApiError && e.code === 'VALIDATION_FAILED')) setErr(errText(e));
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={<>{t('auth.haveAccount')} <Link to="/login" className="font-semibold text-brand-600 hover:underline">{t('nav.login')}</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <span className="label">{t('auth.iWantTo')}</span>
          <div className="grid grid-cols-2 gap-2">
            {(['renter', 'owner'] as const).map((r) => (
              <button type="button" key={r} onClick={() => setRole(r)}
                className={cx('rounded-2xl p-4 text-start ring-1 transition', role === r ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white ring-ink-200 hover:ring-ink-300')}>
                <Icon name={r === 'renter' ? 'search' : 'wallet'} size={20} />
                <div className="mt-2 text-sm font-bold">{t(`auth.roles.${r}`)}</div>
                <div className={cx('text-xs', role === r ? 'text-ink-300' : 'text-ink-500')}>{t(`auth.roles.${r}Desc`)}</div>
              </button>
            ))}
          </div>
        </div>
        <Field label={t('auth.fullName')} error={errors.fullName}><Input autoComplete="name" value={f.fullName} onChange={up('fullName')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.email')} error={errors.email}><Input type="email" autoComplete="email" value={f.email} onChange={up('email')} /></Field>
          <Field label={t('auth.phone')} error={errors.phone} hint={t('auth.phoneHint')}><Input type="tel" autoComplete="tel" dir="ltr" placeholder="0812 3456 7890" value={f.phone} onChange={up('phone')} /></Field>
        </div>
        <Field label={t('auth.password')} error={errors.password} hint={t('auth.passwordHint')}><Input type="password" autoComplete="new-password" value={f.password} onChange={up('password')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.city')}><Select value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value, universityId: '' })}>
            <option value="">{t('common.optional')}</option>{cities?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label={t('auth.university')}><Select value={f.universityId} onChange={up('universityId')} disabled={!f.cityId}>
            <option value="">{t('common.optional')}</option>{unis?.items.map((u) => <option key={u.id} value={u.id}>{u.short_name}</option>)}</Select></Field>
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t('auth.createAccount')}</Button>
        <p className="text-center text-xs text-ink-500">{t('auth.consent')} <Link to="/terms" className="underline">{t('footer.terms')}</Link></p>
      </form>
    </AuthShell>
  );
}
