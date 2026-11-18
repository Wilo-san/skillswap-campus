import { CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Booking } from '../lib/types';
import { dayKey, fmtDayLong } from '../lib/format';
import BookingCard from '../components/BookingCard';
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../components/ui';

export default function Planning() {
  const { data, error, loading, reload } = useFetch(() => api.get<{ bookings: Booking[] }>('/bookings/planning'), []);
  const now = new Date();
  const all = data?.bookings ?? [];
  const upcoming = all.filter((b) => b.status !== 'COMPLETED' && new Date(b.endsAt) > now);
  const toConfirm = all.filter((b) => (b.can.confirm || b.status === 'DISPUTED') && new Date(b.endsAt) <= now);
  const past = all.filter((b) => b.status === 'COMPLETED').reverse();
  const groups = upcoming.reduce<Record<string, Booking[]>>((acc, b) => { (acc[dayKey(b.startsAt)] ??= []).push(b); return acc; }, {});

  return (
    <>
      <PageHeader title="Planning" subtitle="Vos séances acceptées, comme intervenant ou comme bénéficiaire." />
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : all.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Votre planning est vide" text="Les séances acceptées apparaîtront ici." action={<Link to="/catalog" className="btn-primary">Explorer le catalogue</Link>} />
      ) : (
        <div className="space-y-8">
          {toConfirm.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-amber-700">À confirmer ou à suivre</h2>
              <div className="space-y-3">{toConfirm.map((b) => <BookingCard key={b.id} booking={b} onChange={() => reload(true)} />)}</div>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-lg font-bold">À venir</h2>
            {upcoming.length === 0 ? <p className="rounded-2xl bg-white p-5 text-sm text-ink-500 ring-1 ring-slate-200">Aucune séance à venir.</p> : (
              <div className="space-y-6">
                {Object.entries(groups).map(([day, items]) => (
                  <div key={day}>
                    <p className="mb-2 text-sm font-semibold capitalize text-brand-700">{fmtDayLong(items[0].startsAt)}</p>
                    <div className="space-y-3">{items.map((b) => <BookingCard key={b.id} booking={b} onChange={() => reload(true)} />)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-ink-700">Séances réalisées</h2>
              <div className="space-y-3">{past.map((b) => <BookingCard key={b.id} booking={b} onChange={() => reload(true)} />)}</div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
