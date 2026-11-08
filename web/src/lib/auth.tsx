import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useI18n, type Locale } from '../i18n';

export interface Me {
  id: number; email: string; phone: string; role: 'renter' | 'owner' | 'admin'; status: string;
  email_verified_at: string | null; phone_verified_at: string | null; is_demo: number;
  full_name: string; avatar_url: string | null; date_of_birth: string | null; city_id: number | null; university_id: number | null;
  university_verified: number; bio: string | null; locale: Locale; city_name: string | null; university_name: string | null;
  verifications: { id: number; type: string; status: string; license_class: string | null; expires_on: string | null; review_note: string | null; created_at: string }[];
  eligibility: { motorcycle: boolean; missing: string[]; minAge: number };
}

interface AuthCtx { user: Me | null; loading: boolean; setUser: (u: Me | null) => void; refresh: () => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { locale, setLocale } = useI18n();

  const setUser = useCallback((u: Me | null) => setUserState(u), []);
  const refresh = useCallback(async () => {
    try { setUserState((await api.get<{ user: Me | null }>('/api/auth/me')).user); } catch { setUserState(null); }
  }, []);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  // Language preference: saved locally for everyone, and on the profile for signed-in users (follows them across devices).
  useEffect(() => {
    const on = (e: Event) => {
      const l = (e as CustomEvent).detail as Locale;
      if (user && user.locale !== l) api.patch('/api/me/profile', { locale: l }).then((r) => setUserState(r.user)).catch(() => {});
    };
    window.addEventListener('vx:locale', on);
    return () => window.removeEventListener('vx:locale', on);
  }, [user]);
  useEffect(() => {
    let explicit = false;
    try { explicit = !!localStorage.getItem('velox.locale'); } catch { /* ignore */ }
    if (user && !explicit && user.locale !== locale) setLocale(user.locale);
  }, [user?.id]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUserState(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
