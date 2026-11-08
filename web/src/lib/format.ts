import { useI18n, type TFn } from '../i18n';

/** Locale-aware formatting. Javanese falls back to Indonesian conventions where the browser lacks jv data. */
const safeLocale = (intl: string) => {
  try { new Intl.NumberFormat(intl); return intl; } catch { return 'id-ID'; }
};
export const tzFor = (offset?: number | null) =>
  offset === 480 ? 'Asia/Makassar' : offset === 540 ? 'Asia/Jayapura' : 'Asia/Jakarta';
export const tzLabel = (offset?: number | null) => (offset === 480 ? 'WITA' : offset === 540 ? 'WIT' : 'WIB');

export function useFormat() {
  const { intl, t, locale } = useI18n();
  const loc = safeLocale(intl);
  // Rupiah is shown as "Rp 12.000"-style in every locale; the pattern lives in the locale files (units.money).
  const money = (n: number | null | undefined) =>
    n == null ? '—' : t('units.money', { n: new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(n) });
  const num = (n: number, digits = 0) => new Intl.NumberFormat(loc, { maximumFractionDigits: digits }).format(n);
  const dateTime = (iso: string, offset?: number | null) =>
    new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short', timeZone: tzFor(offset) }).format(new Date(iso));
  const date = (iso: string, offset?: number | null) =>
    new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeZone: tzFor(offset) }).format(new Date(iso));
  const time = (iso: string, offset?: number | null) =>
    new Intl.DateTimeFormat(loc, { timeStyle: 'short', timeZone: tzFor(offset) }).format(new Date(iso));
  const relative = (iso: string) => {
    const diff = (new Date(iso).getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
    const a = Math.abs(diff);
    if (a < 60) return rtf.format(Math.round(diff), 'second');
    if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  };
  const duration = (minutes: number) => formatDuration(minutes, t, num);
  const km = (d: number) => (d < 1 ? t('units.m', { n: num(Math.round(d * 1000)) }) : t('units.km', { n: num(d, 1) }));
  return { money, num, dateTime, date, time, relative, duration, km, locale };
}

export function formatDuration(minutes: number, t: TFn, num: (n: number) => string = String) {
  if (minutes < 60) return t('units.minutes', { n: num(minutes) });
  if (minutes % 1440 === 0) return minutes === 1440 ? t('units.oneDay') : t('units.days', { n: num(minutes / 1440) });
  if (minutes >= 1440) {
    const d = Math.floor(minutes / 1440), h = Math.round((minutes % 1440) / 60);
    return `${t('units.days', { n: num(d) })} ${t('units.hours', { n: num(h) })}`;
  }
  const h = minutes / 60;
  return h === 1 ? t('units.oneHour') : t('units.hours', { n: Number.isInteger(h) ? num(h) : String(h) });
}

/** Local date (YYYY-MM-DD) + "HH:MM" in the vehicle's time zone → UTC ISO string. */
export function localToIso(date: string, time: string, offsetMin: number) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - offsetMin * 60_000).toISOString();
}
/** UTC ISO → { date, time } in the vehicle's time zone. */
export function isoToLocal(iso: string, offsetMin: number) {
  const d = new Date(new Date(iso).getTime() + offsetMin * 60_000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}
export const minutesToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
