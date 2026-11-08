import { useT } from '../i18n';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/Layout';
import { ButtonLink, Card, Empty, Notice } from '../components/ui';

/** Static content pages. All copy lives in locale files (info.trust.*, info.terms.*). */
export function InfoPage({ page }: { page: 'trust' | 'terms' }) {
  const t = useT();
  const sections = page === 'trust' ? ['verify', 'moto', 'handover', 'payments', 'messaging', 'reviews', 'reporting', 'privacy'] : ['scope', 'parties', 'booking', 'payment', 'deposit', 'cancellation', 'late', 'responsibility', 'motorcycles', 'disputes', 'data'];
  const icons: Record<string, string> = { verify: 'shield', moto: 'moto', handover: 'document', payments: 'wallet', messaging: 'chat', reviews: 'star', reporting: 'flag', privacy: 'lock' };
  return (
    <div className="container-x max-w-4xl py-8 sm:py-12">
      <PageHeader title={t(`info.${page}.title`)} subtitle={t(`info.${page}.subtitle`)} />
      {page === 'terms' && <div className="mb-8"><Notice tone="warn" title={t('info.terms.draftTitle')}>{t('info.terms.draftBody')}</Notice></div>}
      <div className={page === 'trust' ? 'grid gap-5 sm:grid-cols-2' : 'space-y-5'}>
        {sections.map((s, i) => (
          <Card key={s} className="p-6">
            <h2 className="flex items-center gap-3 font-bold">
              {page === 'trust' ? <span className="neu-icon h-11 w-11"><Icon name={icons[s]} size={18} /></span>
                : <span className="text-brand-600">{i + 1}.</span>}
              {t(`info.${page}.${s}.title`)}
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">{t(`info.${page}.${s}.body`)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function NotFound() {
  const t = useT();
  return <div className="container-x py-24"><Empty icon="search" title={t('notFound.title')} body={t('notFound.body')} action={<ButtonLink to="/" variant="primary">{t('notFound.home')}</ButtonLink>} /></div>;
}
