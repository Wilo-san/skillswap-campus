import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { AppLayout } from './components/Layout';
import { PageLoader } from './components/ui';
import { LoginPage, RegisterPage } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Catalog from './pages/Catalog';
import OfferDetail from './pages/OfferDetail';
import MyOffers from './pages/MyOffers';
import OfferForm from './pages/OfferForm';
import Requests from './pages/Requests';
import Bookings from './pages/Bookings';
import Planning from './pages/Planning';
import Wallet from './pages/Wallet';
import ProfilePage from './pages/Profile';
import PublicProfile from './pages/PublicProfile';
import Disputes from './pages/Disputes';
import DisputeDetail from './pages/DisputeDetail';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminCategories from './pages/admin/AdminCategories';
import AdminOffers from './pages/admin/AdminOffers';
import AdminDisputes from './pages/admin/AdminDisputes';

function Protected({ children, role }: { children: ReactNode; role?: 'ADMIN' | 'STUDENT' }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (role === 'ADMIN' && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="font-display text-6xl font-extrabold text-brand-600">404</p>
      <p className="mt-2 text-ink-500">Cette page n'existe pas.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="offers" element={<MyOffers />} />
        <Route path="offers/new" element={<OfferForm />} />
        <Route path="offers/:id/edit" element={<OfferForm />} />
        <Route path="offers/:id" element={<OfferDetail />} />
        <Route path="requests" element={<Requests />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="planning" element={<Planning />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profiles/:id" element={<PublicProfile />} />
        <Route path="disputes" element={<Disputes />} />
        <Route path="disputes/:id" element={<DisputeDetail />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin" element={<Protected role="ADMIN"><AppLayout admin /></Protected>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="offers" element={<AdminOffers />} />
        <Route path="disputes" element={<AdminDisputes />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
