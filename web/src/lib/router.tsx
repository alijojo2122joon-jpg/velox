import { createContext, useContext, useEffect, useState, type ReactNode, type MouseEvent, type AnchorHTMLAttributes } from 'react';

/** Tiny history-API router (keeps the bundle small; the API mirrors react-router's essentials). */
interface Loc { path: string; search: URLSearchParams }
const RouterCtx = createContext<Loc>({ path: '/', search: new URLSearchParams() });

const read = (): Loc => ({ path: window.location.pathname, search: new URLSearchParams(window.location.search) });

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event('vx:navigate'));
  if (!opts.replace) window.scrollTo({ top: 0 });
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener('popstate', on);
    window.addEventListener('vx:navigate', on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('vx:navigate', on); };
  }, []);
  return <RouterCtx.Provider value={loc}>{children}</RouterCtx.Provider>;
}

export const useLocation = () => useContext(RouterCtx);

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  const m = re.exec(path);
  if (!m) return null;
  return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
}

/** Update query params without a full navigation (used by search filters). */
export function setSearch(params: Record<string, string | number | undefined | null>, replace = true) {
  const s = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') s.delete(k); else s.set(k, String(v));
  }
  const str = s.toString();
  navigate(window.location.pathname + (str ? '?' + str : ''), { replace });
}

export function Link({ to, children, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || rest.target) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}
