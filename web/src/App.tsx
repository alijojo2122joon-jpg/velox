import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { I18nProvider, useI18n } from './i18n';
import { AuthProvider, useAuth } from './lib/auth';
import { RouterProvider, useLocation, matchPath, navigate } from './lib/router';
import { Navbar, Footer } from './components/Layout';
import { PageLoader, ToastProvider } from './components/ui';
import { Home } from './pages/Home';
import { Search } from './pages/Search';
import { VehicleDetail } from './pages/VehicleDetail';
import { Login, Register } from './pages/Auth';

// Code splitting: dashboards, admin and forms load only when visited.
const BookingDetail = lazy(() => import('./pages/BookingDetail').then((m) => ({ default: m.BookingDetail })));
const Pay = lazy(() => import('./pages/Pay').then((m) => ({ default: m.Pay })));
const RenterDashboard = lazy(() => import('./pages/RenterDashboard').then((m) => ({ default: m.RenterDashboard })));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard').then((m) => ({ default: m.OwnerDashboard })));
const VehicleForm = lazy(() => import('./pages/VehicleForm').then((m) => ({ default: m.VehicleForm })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const Universities = lazy(() => import('./pages/Universities').then((m) => ({ default: m.Universities })));
const UniversityDetail = lazy(() => import('./pages/Universities').then((m) => ({ default: m.UniversityDetail })));
const InfoPage = lazy(() => import('./pages/Info').then((m) => ({ default: m.InfoPage })));
const NotFound = lazy(() => import('./pages/Info').then((m) => ({ default: m.NotFound })));

type Route = { path: string; render: (p: Record<string, string>) => ReactNode; auth?: 'user' | 'owner' | 'admin'; bare?: boolean };
const routes: Route[] = [
  { path: '/', render: () => <Home /> },
  { path: '/search', render: () => <Search />, bare: true },
  { path: '/vehicles/:id', render: (p) => <VehicleDetail id={Number(p.id)} /> },
  { path: '/login', render: () => <Login /> },
  { path: '/register', render: () => <Register /> },
  { path: '/bookings/:id', render: (p) => <BookingDetail id={Number(p.id)} />, auth: 'user' },
  { path: '/dashboard/owner/bookings/:id', render: (p) => <BookingDetail id={Number(p.id)} />, auth: 'user' },
  { path: '/pay/:ref', render: (p) => <Pay providerRef={p.ref} />, auth: 'user' },
  { path: '/dashboard', render: () => <RenterDashboard />, auth: 'user' },
  { path: '/dashboard/owner', render: () => <OwnerDashboard />, auth: 'owner' },
  { path: '/dashboard/owner/vehicles/new', render: () => <VehicleForm />, auth: 'owner' },
  { path: '/dashboard/owner/vehicles/:id/edit', render: (p) => <VehicleForm id={Number(p.id)} />, auth: 'owner' },
  { path: '/account', render: () => <Account />, auth: 'user' },
  { path: '/messages', render: () => <Messages />, auth: 'user' },
  { path: '/messages/:id', render: (p) => <Messages id={Number(p.id)} />, auth: 'user' },
  { path: '/admin', render: () => <Admin />, auth: 'admin' },
  { path: '/universities', render: () => <Universities /> },
  { path: '/universities/:slug', render: (p) => <UniversityDetail slug={p.slug} /> },
  { path: '/trust', render: () => <InfoPage page="trust" /> },
  { path: '/terms', render: () => <InfoPage page="terms" /> },
];

function Guard({ need, children }: { need?: Route['auth']; children: ReactNode }) {
  const { user, loading } = useAuth();
  const { path } = useLocation();
  useEffect(() => {
    if (loading || !need) return;
    if (!user) navigate(`/login?next=${encodeURIComponent(path + window.location.search)}`, { replace: true });
    else if (need === 'owner' && user.role === 'renter') navigate('/account?become=owner', { replace: true });
    else if (need === 'admin' && user.role !== 'admin') navigate('/', { replace: true });
  }, [user, loading, need, path]);
  if (need && (loading || !user || (need === 'owner' && user.role === 'renter') || (need === 'admin' && user.role !== 'admin'))) return <PageLoader />;
  return <>{children}</>;
}

function Routes() {
  const { path } = useLocation();
  const { ready } = useI18n();
  let match: { route: Route; params: Record<string, string> } | null = null;
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params) { match = { route, params }; break; }
  }
  if (!ready) return <PageLoader />;
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          {match ? <Guard need={match.route.auth}>{match.route.render(match.params)}</Guard> : <NotFound />}
        </Suspense>
      </main>
      {!match?.route.bare && <Footer />}
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <RouterProvider>
        <AuthProvider>
          <ToastProvider>
            <Routes />
          </ToastProvider>
        </AuthProvider>
      </RouterProvider>
    </I18nProvider>
  );
}
