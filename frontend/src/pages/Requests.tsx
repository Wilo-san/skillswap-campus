import { useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Booking } from '../lib/types';
import BookingCard from '../components/BookingCard';
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../components/ui';

export default function Requests() {
  const { data, error, loading, reload } = useFetch(() => api.get<{ bookings: Booking[] }>('/bookings?box=received'), []);
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');
  const all = data?.bookings ?? [];
  const list = tab === 'PENDING' ? all.filter((b) => b.status === 'PENDING') : all;
  const pending = all.filter((b) => b.status === 'PENDING').length;
  return (
    <>
      <PageHeader title="Demandes reçues" subtitle="Acceptez ou refusez les demandes sur vos offres. L'acceptation bloque le coût sur le compte du bénéficiaire." />
      <div className="mb-5 flex gap-2">
        <button onClick={() => setTab('PENDING')} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === 'PENDING' ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-slate-200 hover:bg-slate-50'}`}>À traiter{pending > 0 && ` (${pending})`}</button>
        <button onClick={() => setTab('ALL')} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === 'ALL' ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-slate-200 hover:bg-slate-50'}`}>Toutes</button>
      </div>
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : list.length === 0 ? <EmptyState icon={<Users className="h-6 w-6" />} title={tab === 'PENDING' ? 'Aucune demande à traiter' : 'Aucune demande reçue'} text="Les demandes sur vos offres publiées apparaîtront ici." /> : (
        <div className="space-y-3">{list.map((b) => <BookingCard key={b.id} booking={b} onChange={() => reload(true)} />)}</div>
      )}
    </>
  );
}
