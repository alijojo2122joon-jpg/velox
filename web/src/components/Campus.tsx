import { useT } from '../i18n';
import { useAuth, type Me } from '../lib/auth';
import { Link } from '../lib/router';
import { Icon } from './icons';
import { cx } from './ui';

export type CampusState = 'ok' | 'login' | 'join' | 'pending' | 'verify';

/**
 * Whether the signed-in user may book a students-only campus listing of the given university.
 * The server enforces the same rule (STUDENT_CARD_REQUIRED); this only shapes the interface.
 */
export function campusState(user: Me | null, universityId: number | null | undefined): CampusState {
  if (!user) return 'login';
  if (!universityId || user.university_id !== universityId) return 'join';
  if (user.university_verified) return 'ok';
  return user.verifications?.some((v: any) => v.type === 'student' && v.status === 'pending') ? 'pending' : 'verify';
}

/** Three-step explainer with the user's live status: student card → book campus bikes → pay & pick up. */
export function StudentCardSteps({ universityId, universityName, compact }: { universityId: number; universityName: string; compact?: boolean }) {
  const t = useT();
  const { user } = useAuth();
  const st = campusState(user, universityId);
  const cardDone = st === 'ok';
  const steps = [
    { icon: 'graduation', title: t('campus.s1', { uni: universityName }), body: t('campus.s1d'), done: cardDone, active: !cardDone },
    { icon: 'bike', title: t('campus.s2'), body: t('campus.s2d', { uni: universityName }), done: false, active: cardDone },
    { icon: 'wallet', title: t('campus.s3'), body: t('campus.s3d'), done: false, active: false },
  ];
  return (
    <div className={cx('grid gap-3', !compact && 'md:grid-cols-3')}>
      {steps.map((s, i) => (
        <div key={i} className={cx('flex gap-3 rounded-[18px] p-4 transition-colors', s.active ? 'field' : '')}>
          <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            s.done ? 'bg-emerald-500 text-white' : s.active ? 'bg-brand-600 text-white shadow-[0_8px_18px_-8px_#2f7cf6]' : 'bg-brand-50 text-brand-600')}>
            <Icon name={s.done ? 'check' : s.icon} size={20} strokeWidth={s.done ? 2.6 : 1.8} />
          </span>
          <div className="min-w-0">
            <div className="font-black text-ink-950">{s.title}</div>
            <div className="mt-0.5 text-sm leading-relaxed text-ink-500">{s.body}</div>
            {i === 0 && <CampusAction state={st} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The one next action for the user's campus state (or a confirmation when everything is in place). */
export function CampusAction({ state, next }: { state: CampusState; next?: string }) {
  const t = useT();
  if (state === 'ok') return <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600"><Icon name="check" size={15} strokeWidth={2.6} />{t('campus.ok')}</div>;
  if (state === 'pending') return <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-amber-600"><Icon name="clock" size={15} />{t('campus.pending')}</div>;
  const to = state === 'login' ? `/login?next=${encodeURIComponent(next ?? location.pathname)}` : '/account';
  const label = state === 'login' ? t('campus.login') : state === 'join' ? t('campus.join') : t('campus.verify');
  return <Link to={to} className="mt-2 inline-flex items-center gap-1 text-sm font-extrabold text-brand-600 hover:underline">{label}<Icon name="arrowRight" size={15} /></Link>;
}
