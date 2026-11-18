import { useState } from 'react';
import { Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Booking, BookingStatus } from '../lib/types';
import { statusLabel } from '../lib/format';
import BookingCard from '../components/BookingCard';
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../components/ui';

export default function Bookings() {
  const { data, error, loading, reload } = useFetch(() => api.get<{ bookings: Booking[] }>('/bookings?box=sent'), []);
  const [filter, setFilter] = useState<'ALL' | BookingStatus>('ALL');
  const list = (data?.bookings ?? []).filter((b) => filter === 'ALL' || b.status === filter);
  const filters: ('ALL' | BookingStatus)[] = ['ALL', 'PENDING', 'ACCEPTED', 'COMPLETED', 'DISPUTED', 'REFUSED', 'CANCELLED'];
  return (
    <>
      <PageHeader title="Mes demandes" subtitle="Suivez l'état de vos demandes de séances, confirmez leur réalisation et évaluez vos intervenants." />
      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${filter === f ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{f === 'ALL' ? 'Toutes' : statusLabel[f]}</button>)}
      </div>
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : list.length === 0 ? <EmptyState icon={<Send className="h-6 w-6" />} title="Aucune demande" text="Parcourez le catalogue pour demander votre première séance." action={<Link to="/catalog" className="btn-primary">Explorer le catalogue</Link>} /> : (
        <div className="space-y-3">{list.map((b) => <BookingCard key={b.id} booking={b} onChange={() => reload(true)} />)}</div>
      )}
    </>
  );
}
