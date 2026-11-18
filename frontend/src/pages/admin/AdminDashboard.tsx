import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BookOpen, Coins, Lock, Tag, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import type { Dispute } from '../../lib/types';
import { disputeReasonLabel, fmtFull, fullName } from '../../lib/format';
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../../components/ui';

interface Stats {
  activeAccounts: number; totalAccounts: number; publishedOffers: number; acceptedBookings: number;
  completedBookings: number; acceptedOrCompleted: number; creditsTransferred: number; openDisputes: number;
  pendingBookings: number; creditsBlocked: number;
}

export default function AdminDashboard() {
  const stats = useFetch(() => api.get<{ stats: Stats }>('/admin/stats'), []);
  const disputes = useFetch(() => api.get<{ disputes: Dispute[] }>('/admin/disputes?status=OPEN'), []);
  if (stats.loading && !stats.data) return <PageLoader />;
  const s = stats.data?.stats;

  const cards = [
    { label: 'Comptes actifs', value: s?.activeAccounts, sub: `${s?.totalAccounts ?? 0} comptes au total`, icon: Users, to: '/admin/users' },
    { label: 'Offres publiées', value: s?.publishedOffers, sub: 'visibles dans le catalogue', icon: Tag, to: '/admin/offers' },
    { label: 'Séances acceptées', value: s?.acceptedBookings, sub: `${s?.pendingBookings ?? 0} demande(s) en attente`, icon: BookOpen, to: '/admin/offers' },
    { label: 'Séances réalisées', value: s?.completedBookings, sub: 'crédits transférés', icon: Coins, to: '/admin/disputes' },
    { label: 'Litiges ouverts', value: s?.openDisputes, sub: 'à traiter', icon: AlertTriangle, to: '/admin/disputes', alert: (s?.openDisputes ?? 0) > 0 },
    { label: 'Crédits bloqués', value: s?.creditsBlocked, sub: 'sur les comptes étudiants', icon: Lock },
  ];

  return (
    <>
      <PageHeader title="Espace administrateur" subtitle="Vue d'ensemble du campus : comptes, offres, séances et litiges." />
      <ErrorBanner error={stats.error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const inner = (
            <>
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{c.label}</p><Icon className={`h-4 w-4 ${c.alert ? 'text-amber-500' : 'text-ink-500'}`} /></div>
              <p className={`mt-2 font-display text-3xl font-extrabold ${c.alert ? 'text-amber-600' : 'text-ink-900'}`}>{c.value ?? 0}</p>
              <p className="mt-1 text-xs text-ink-500">{c.sub}</p>
            </>
          );
          return c.to
            ? <Link key={c.label} to={c.to} className={`card p-5 transition hover:border-brand-200 hover:shadow-pop ${c.alert ? 'border-amber-200' : ''}`}>{inner}</Link>
            : <div key={c.label} className="card p-5">{inner}</div>;
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-brand-100 bg-brand-50 p-4">
        <p className="text-sm text-brand-900"><strong>{s?.creditsTransferred ?? 0} crédits</strong> ont été transférés aux intervenants depuis l'ouverture du campus.</p>
        <Link to="/admin/users" className="btn-secondary btn-sm hidden sm:inline-flex">Gérer les comptes<ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Litiges à traiter</h2>
          <Link to="/admin/disputes" className="text-sm font-semibold text-brand-600 hover:underline">Tout voir</Link>
        </div>
        {disputes.loading ? <PageLoader /> : (disputes.data?.disputes.length ?? 0) === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Aucun litige en attente" text="Les signalements des étudiants apparaîtront ici." />
        ) : (
          <div className="space-y-2">
            {disputes.data!.disputes.slice(0, 5).map((d) => (
              <Link key={d.id} to="/admin/disputes" className="card flex flex-wrap items-center justify-between gap-2 p-4 transition hover:border-brand-200">
                <div>
                  <p className="text-sm font-bold">{d.booking.offer.title}</p>
                  <p className="text-xs text-ink-500">{disputeReasonLabel[d.reason]} · {fullName(d.booking.teacher)} / {fullName(d.booking.learner)} · {fmtFull(d.createdAt).split(' à')[0]}</p>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{d.booking.cost} crédit{d.booking.cost > 1 ? 's' : ''} en jeu</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
