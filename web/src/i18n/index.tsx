import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './locales/en.json';

/**
 * Centralised localisation.
 * - All interface text lives in ./locales/*.json — components only reference keys.
 * - English ships in the main bundle (default + fallback); other locales are lazy-loaded chunks.
 * - Persian switches the whole document to RTL; layout uses logical CSS properties (ms/me/ps/pe/start/end).
 */
export type Locale = 'en' | 'id' | 'jv' | 'fa';
export const LOCALES: { code: Locale; label: string; short: string; dir: 'ltr' | 'rtl'; intl: string }[] = [
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr', intl: 'en-GB' },
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID', dir: 'ltr', intl: 'id-ID' },
  { code: 'jv', label: 'Basa Jawa', short: 'JV', dir: 'ltr', intl: 'jv-ID' },
  { code: 'fa', label: 'فارسی', short: 'FA', dir: 'rtl', intl: 'fa-IR-u-ca-gregory' },
];

type Dict = Record<string, any>;
const loaders: Record<Locale, () => Promise<Dict>> = {
  en: async () => en,
  id: () => import('./locales/id.json').then((m) => m.default),
  jv: () => import('./locales/jv.json').then((m) => m.default),
  fa: () => import('./locales/fa.json').then((m) => m.default),
};

const STORAGE_KEY = 'velox.locale';
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && LOCALES.some((l) => l.code === saved)) return saved;
  } catch { /* storage unavailable */ }
  return 'en'; // English is the default language
}

const lookup = (dict: Dict, key: string): string | undefined => {
  let cur: any = dict;
  for (const part of key.split('.')) { cur = cur?.[part]; if (cur === undefined) return undefined; }
  return typeof cur === 'string' ? cur : undefined;
};

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface Ctx { locale: Locale; dir: 'ltr' | 'rtl'; intl: string; t: TFn; setLocale: (l: Locale) => void; ready: boolean }
const I18nCtx = createContext<Ctx>(null as any);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [dict, setDict] = useState<Dict>(locale === 'en' ? en : {});
  const [ready, setReady] = useState(locale === 'en');
  const meta = LOCALES.find((l) => l.code === locale)!;

  useEffect(() => {
    let alive = true;
    loaders[locale]().then((d) => { if (alive) { setDict(d); setReady(true); } });
    document.documentElement.lang = locale;
    document.documentElement.dir = meta.dir;
    return () => { alive = false; };
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    setLocaleState(l);
    window.dispatchEvent(new CustomEvent('vx:locale', { detail: l }));
  }, []);

  const t = useCallback<TFn>((key, vars) => {
    // Fallback to English keeps the UI usable if a translation is missing; scripts/check-i18n.mjs keeps them complete.
    let s = lookup(dict, key) ?? lookup(en, key) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }, [dict]);

  const value = useMemo(() => ({ locale, dir: meta.dir, intl: meta.intl, t, setLocale, ready }), [locale, t, ready]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;
