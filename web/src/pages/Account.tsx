import { useState } from 'react';
import { useI18n, LOCALES } from '../i18n';
import { useLocation, navigate } from '../lib/router';
import { useApi } from '../lib/hooks';
import { api, fileToDataUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFormat } from '../lib/format';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/Layout';
import { Avatar, Badge, Button, Card, Field, Input, Modal, Notice, Select, StatusBadge, Textarea, cx, useErrorText, useFieldErrors, useToast } from '../components/ui';

export function Account() {
  const { t, locale, setLocale } = useI18n();
  const { user, setUser } = useAuth();
  const { search } = useLocation();
  const toast = useToast();
  const errText = useErrorText();
  const fieldErrors = useFieldErrors();
  const { date } = useFormat();
  const { data: cities } = useApi<{ items: any[] }>('/api/locations/cities');
  const [p, setP] = useState({ fullName: user!.full_name, dateOfBirth: user!.date_of_birth ?? '', cityId: String(user!.city_id ?? ''), universityId: String(user!.university_id ?? ''), bio: user!.bio ?? '' });
  const { data: unis } = useApi<{ items: any[] }>(p.cityId ? `/api/universities?cityId=${p.cityId}` : null, [p.cityId]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [verify, setVerify] = useState<null | 'email' | 'phone'>(null);
  const [doc, setDoc] = useState<null | 'identity' | 'driving_license' | 'student'>(null);
  const u = user!;

  const save = async () => {
    setSaving(true); setErrors({});
    try {
      const r = await api.patch('/api/me/profile', { fullName: p.fullName, dateOfBirth: p.dateOfBirth || undefined, cityId: p.cityId ? Number(p.cityId) : null,
        universityId: p.universityId ? Number(p.universityId) : null, bio: p.bio });
      setUser(r.user); toast(t('account.saved'));
    } catch (e) { setErrors(fieldErrors(e)); toast(errText(e), 'error'); } finally { setSaving(false); }
  };
  const avatar = async (file?: File) => {
    if (!file) return;
    try { const r = await api.patch('/api/me/profile', { avatar: await fileToDataUrl(file, 512) }); setUser(r.user); toast(t('account.saved')); }
    catch (e) { toast(errText(e), 'error'); }
  };
  const becomeOwner = async () => { const r = await api.post('/api/me/become-owner'); setUser(r.user); toast(t('account.nowOwner')); navigate('/dashboard/owner/vehicles/new'); };
  const latest = (type: string) => u.verifications.find((v) => v.type === type);

  return (
    <div className="container-x max-w-5xl py-8 sm:py-10">
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />

      {u.role === 'renter' && (
        <Card className={cx('mb-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-center', search.get('become') === 'owner' && 'ring-2 ring-brand-500')}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon name="wallet" /></span>
          <div className="flex-1"><div className="font-bold">{t('account.becomeOwnerTitle')}</div><div className="text-sm text-ink-500">{t('account.becomeOwnerBody')}</div></div>
          <Button variant="brand" onClick={becomeOwner}>{t('account.becomeOwner')}</Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">{t('account.profile')}</h2>
            <div className="mb-6 flex items-center gap-4">
              <Avatar name={u.full_name} url={u.avatar_url} size={72} />
              <label className="cursor-pointer"><span className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-ink-200 hover:bg-ink-50"><Icon name="camera" size={16} />{t('account.changePhoto')}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => avatar(e.target.files?.[0])} /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('auth.fullName')} error={errors.fullName}><Input value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} /></Field>
              <Field label={t('account.dob')} error={errors.dateOfBirth} hint={t('account.dobHint')}><Input type="date" value={p.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setP({ ...p, dateOfBirth: e.target.value })} /></Field>
              <Field label={t('auth.city')}><Select value={p.cityId} onChange={(e) => setP({ ...p, cityId: e.target.value, universityId: '' })}><option value="">—</option>{cities?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label={t('auth.university')} hint={u.university_verified ? t('account.uniVerified') : undefined}><Select value={p.universityId} disabled={!p.cityId} onChange={(e) => setP({ ...p, universityId: e.target.value })}><option value="">—</option>{unis?.items.map((x) => <option key={x.id} value={x.id}>{x.short_name} — {x.name}</option>)}</Select></Field>
              <Field className="sm:col-span-2" label={t('account.bio')}><Textarea rows={3} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} maxLength={500} /></Field>
            </div>
            <Button className="mt-5" loading={saving} onClick={save}>{t('common.saveChanges')}</Button>
          </Card>

          <Card className="p-6">
            <h2 className="mb-1 text-lg font-bold">{t('account.documents')}</h2>
            <p className="mb-5 text-sm text-ink-500">{t('account.documentsBody')}</p>
            <div className="space-y-3">
              {(['identity', 'driving_license', 'student'] as const).map((type) => {
                const v = latest(type);
                return (
                  <div key={type} className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink-50 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-ink-200"><Icon name={type === 'student' ? 'graduation' : type === 'identity' ? 'user' : 'moto'} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{t(`verification.types.${type}`)}</div>
                      <div className="text-xs text-ink-500">{t(`verification.hints.${type}`)}</div>
                      {v?.review_note && v.status === 'rejected' && <div className="mt-1 text-xs text-red-600">{v.review_note}</div>}
                      {v?.license_class && <div className="mt-0.5 text-xs text-ink-500">SIM {v.license_class}{v.expires_on ? ` · ${t('account.validUntil', { d: date(v.expires_on) })}` : ''}</div>}
                    </div>
                    {v ? <StatusBadge status={v.status} /> : <Badge>{t('account.notSubmitted')}</Badge>}
                    {(!v || v.status === 'rejected') && <Button size="sm" variant="secondary" icon="plus" onClick={() => setDoc(type)}>{t('account.upload')}</Button>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-bold">{t('account.contact')}</h2>
            {(['email', 'phone'] as const).map((ch) => {
              const ok = ch === 'email' ? u.email_verified_at : u.phone_verified_at;
              return (
                <div key={ch} className="flex items-center gap-3 border-b border-ink-100 py-3 last:border-0">
                  <Icon name={ch === 'email' ? 'mail' : 'phone'} className="text-ink-400" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold" dir="ltr">{ch === 'email' ? u.email : u.phone}</div></div>
                  {ok ? <Badge tone="green" icon="check">{t('account.verified')}</Badge> : <Button size="sm" variant="secondary" onClick={() => setVerify(ch)}>{t('account.verify')}</Button>}
                </div>
              );
            })}
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Icon name="moto" />{t('eligibility.title')}</h2>
            {u.eligibility.motorcycle ? <Notice tone="success">{t('eligibility.ok')}</Notice> : (
              <>
                <p className="text-sm text-ink-600">{t('eligibility.intro', { age: u.eligibility.minAge })}</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {['email', 'phone', 'date_of_birth', 'age', 'identity', 'license'].map((k) => {
                    const missing = u.eligibility.missing.includes(k);
                    if (k === 'age' && u.eligibility.missing.includes('date_of_birth')) return null;
                    return <li key={k} className="flex items-center gap-2"><Icon name={missing ? 'x' : 'check'} size={16} className={missing ? 'text-red-500' : 'text-emerald-500'} />{t(`eligibility.items.${k}`, { age: u.eligibility.minAge })}</li>;
                  })}
                </ul>
              </>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 text-lg font-bold">{t('account.language')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {LOCALES.map((l) => <button key={l.code} dir={l.dir} onClick={() => setLocale(l.code)} className={cx('rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition', locale === l.code ? 'bg-ink-900 text-white ring-ink-900' : 'ring-ink-200 hover:bg-ink-50')}>{l.label}</button>)}
            </div>
            <p className="mt-2 text-xs text-ink-500">{t('account.languageHint')}</p>
          </Card>

          <Card className="p-6 text-sm text-ink-600">
            <h2 className="mb-2 text-lg font-bold text-ink-900">{t('account.privacy')}</h2>
            <p>{t('account.privacyBody')}</p>
            <p className="mt-2 text-xs text-ink-400">{t('account.exportSoon')}</p>
          </Card>
        </div>
      </div>

      <VerifyModal channel={verify} onClose={() => setVerify(null)} />
      <DocumentModal type={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

function VerifyModal({ channel, onClose }: { channel: null | 'email' | 'phone'; onClose: () => void }) {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const toast = useToast();
  const errText = useErrorText();
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setSent(false); setCode(''); setDemoCode(null); onClose(); };
  const send = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/auth/verify/${channel}/send`); setSent(true); setDemoCode(r.demoCode ?? null); } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/auth/verify/${channel}/confirm`, { code }); setUser(r.user); toast(t('account.verifiedToast')); close(); } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!channel} onClose={close} title={channel === 'email' ? t('account.verifyEmail') : t('account.verifyPhone')}
      footer={!sent ? <Button loading={busy} onClick={send}>{t('account.sendCode')}</Button> : <Button loading={busy} disabled={code.length !== 6} onClick={confirm}>{t('account.confirm')}</Button>}>
      {!sent ? <p className="text-sm text-ink-600">{t('account.sendCodeBody')}</p> : (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">{t('account.enterCode')}</p>
          <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} dir="ltr" className="h-14 text-center font-mono text-2xl tracking-[0.5em]" />
          {demoCode && <Notice tone="demo" title={t('account.demoCodeTitle')}>{t('account.demoCodeBody')} <b dir="ltr" className="font-mono">{demoCode}</b></Notice>}
        </div>
      )}
    </Modal>
  );
}

function DocumentModal({ type, onClose }: { type: null | 'identity' | 'driving_license' | 'student'; onClose: () => void }) {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const toast = useToast();
  const errText = useErrorText();
  const [f, setF] = useState({ documentNumber: '', licenseClass: 'C', expiresOn: '' });
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/me/verifications', { type, documentNumber: f.documentNumber, document: file,
        ...(type === 'driving_license' ? { licenseClass: f.licenseClass, expiresOn: f.expiresOn || undefined } : {}) });
      setUser(r.user); toast(t('account.docSubmitted')); onClose(); setFile(null);
    } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!type} onClose={onClose} title={type ? t(`verification.types.${type}`) : ''} footer={<Button loading={busy} disabled={!file || f.documentNumber.length < 4} onClick={submit}>{t('account.submitDoc')}</Button>}>
      <div className="space-y-4">
        <Field label={t('account.docNumber')} hint={t('account.docNumberHint')}><Input dir="ltr" value={f.documentNumber} onChange={(e) => setF({ ...f, documentNumber: e.target.value })} /></Field>
        {type === 'driving_license' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('account.licenseClass')}><Select value={f.licenseClass} onChange={(e) => setF({ ...f, licenseClass: e.target.value })}>{['C', 'C1', 'C2', 'A'].map((c) => <option key={c} value={c}>SIM {c}</option>)}</Select></Field>
            <Field label={t('account.expiry')}><Input type="date" value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} /></Field>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-ink-200 p-4 hover:border-brand-400">
          <Icon name="document" /><span className="flex-1 text-sm">{file ? t('vehicleForm.fileReady') : t('account.docFile')}</span>{file && <Icon name="check" className="text-emerald-600" />}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => e.target.files?.[0] && setFile(await fileToDataUrl(e.target.files[0]))} />
        </label>
        <Notice tone="info" icon="lock">{t('account.docPrivacy')}</Notice>
      </div>
    </Modal>
  );
}
