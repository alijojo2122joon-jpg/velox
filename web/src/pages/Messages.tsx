import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Link } from '../lib/router';
import { useApi, useInterval } from '../lib/hooks';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFormat } from '../lib/format';
import { Icon } from '../components/icons';
import { PageHeader } from '../components/Layout';
import { Avatar, Button, Card, Empty, Notice, cx, useErrorText, useToast } from '../components/ui';

export function Messages({ id }: { id?: number }) {
  const t = useT();
  const { relative } = useFormat();
  const list = useApi<{ items: any[] }>('/api/conversations');
  useInterval(list.reload, 15_000);

  return (
    <div className="container-x py-8 sm:py-10">
      <PageHeader title={t('messages.title')} subtitle={t('messages.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className={cx('overflow-hidden', id && 'hidden lg:block')}>
          {!list.data?.items.length ? <Empty icon="chat" title={t('messages.empty')} body={t('messages.emptyBody')} /> : (
            <div className="divide-y divide-ink-100">
              {list.data.items.map((c) => (
                <Link key={c.id} to={`/messages/${c.id}`} className={cx('flex gap-3 p-4 transition hover:bg-ink-50', c.id === id && 'bg-brand-50/60')}>
                  {c.cover_url ? <img src={c.cover_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <Avatar name={c.other_name} size={48} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{c.other_name}</span>{c.last_message_at && <span className="shrink-0 text-xs text-ink-400">{relative(c.last_message_at)}</span>}</div>
                    <div className="truncate text-xs text-ink-500">{c.vehicle_name} · {t(`messages.as.${c.my_role}`)}</div>
                    <div className={cx('mt-0.5 truncate text-sm', c.unread ? 'font-semibold text-ink-900' : 'text-ink-500')}>{c.last_body ?? t('messages.noMessages')}</div>
                  </div>
                  {c.unread > 0 && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />}
                </Link>
              ))}
            </div>
          )}
        </Card>
        {id ? <Thread id={id} onSent={list.reload} /> : <Card className="hidden lg:block"><Empty icon="chat" title={t('messages.select')} /></Card>}
      </div>
    </div>
  );
}

function Thread({ id, onSent }: { id: number; onSent: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const { time, date } = useFormat();
  const toast = useToast();
  const errText = useErrorText();
  const { data, reload, loading } = useApi<any>(`/api/conversations/${id}/messages`, [id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useInterval(reload, 8_000);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data?.items.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await api.post(`/api/conversations/${id}/messages`, { body: text.trim() }); setText(''); reload(); onSent(); }
    catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  if (loading && !data) return <Card className="h-[60vh] animate-pulse" />;
  if (!data) return <Card><Empty icon="chat" title={t('messages.notFound')} /></Card>;
  const c = data.conversation;
  const otherName = c.renter_id === user!.id ? c.owner_name : c.renter_name;
  let lastDay = '';

  return (
    <Card className="flex h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-3.5">
        <Link to="/messages" className="rounded-lg p-1 hover:bg-ink-100 lg:hidden" aria-label={t('common.back')}><Icon name="arrowLeft" /></Link>
        <Avatar name={otherName} size={38} />
        <div className="min-w-0 flex-1"><div className="truncate font-bold">{otherName}</div><Link to={`/vehicles/${c.vehicle_id}`} className="truncate text-xs text-brand-600 hover:underline">{c.vehicle_name}</Link></div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-ink-50/50 px-5 py-4">
        <Notice tone="info" icon="shield">{t('messages.safety')}</Notice>
        {data.items.map((m: any) => {
          const day = date(m.created_at);
          const showDay = day !== lastDay; lastDay = day;
          const mine = m.sender_id === user!.id;
          return (
            <div key={m.id}>
              {showDay && <div className="my-3 text-center text-xs font-semibold text-ink-400">{day}</div>}
              <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm', mine ? 'rounded-ee-md bg-gradient-to-br from-brand-500 to-brand-700 text-white' : 'rounded-es-md bg-white/90 text-ink-900 ring-1 ring-white')}>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={cx('mt-1 text-end text-[10px]', mine ? 'text-ink-300' : 'text-ink-400')}>{time(m.created_at)}{mine && m.read_at && ' · ✓✓'}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="flex gap-2 border-t border-ink-100 p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder={t('messages.placeholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="input h-11 flex-1 resize-none py-2.5" />
        <Button variant="brand" icon="send" loading={busy} onClick={send} disabled={!text.trim()} aria-label={t('messages.send')} />
      </div>
    </Card>
  );
}
