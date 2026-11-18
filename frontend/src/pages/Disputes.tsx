import { Link } from 'react-router-dom';
import { Gavel } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Dispute } from '../lib/types';
import { disputeReasonLabel, fmtFull, fullName } from '../lib/format';
import { EmptyState, ErrorBanner, PageHeader, PageLoader, Pill } from '../components/ui';

export default function Disputes() {
  const { data, error, loading } = useFetch(() => api.get<{ disputes: Dispute[] }>('/disputes'), []);
  return (
    <>
      <PageHeader title="Signalements" subtitle="Suivez les litiges ouverts sur vos séances et la décision de l'administrateur." />
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : (data?.disputes.length ?? 0) === 0 ? (
        <EmptyState icon={<Gavel className="h-6 w-6" />} title="Aucun signalement" text="Vous pouvez signaler un problème depuis une séance acceptée qui a déjà commencé." />
      ) : (
        <div className="space-y-3">
          {data!.disputes.map((d) => {
            const other = d.openedBy.id === d.booking.teacher.id ? d.booking.learner : d.booking.teacher;
            return (
              <Link key={d.id} to={`/disputes/${d.id}`} className="card block p-5 transition hover:border-brand-200 hover:shadow-pop">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold">{d.booking.offer.title}</p>
                    <p className="text-sm text-ink-500">Avec {fullName(other)} · {fmtFull(d.booking.startsAt)}</p>
                  </div>
                  <Pill tone={d.status === 'OPEN' ? 'amber' : 'emerald'}>{d.status === 'OPEN' ? 'En cours d’examen' : d.decision === 'TRANSFER' ? 'Transfert décidé' : 'Restitution décidée'}</Pill>
                </div>
                <p className="mt-2 text-sm text-ink-700"><strong>{disputeReasonLabel[d.reason]}</strong> · {d.description}</p>
                <p className="mt-1 text-xs text-ink-500">{d.comments.length} message{d.comments.length > 1 ? 's' : ''} échangé{d.comments.length > 1 ? 's' : ''}</p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
