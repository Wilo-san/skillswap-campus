import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Coins, Compass, Inbox, Lock, Plus, Sparkles, Star, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import type { Booking, Offer } from '../lib/types';
import { fmtRange, fullName } from '../lib/format';
import { Avatar, EmptyState, ErrorBanner, PageHeader, PageLoader, Pill, Stars } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const planning = useFetch(() => api.get<{ bookings: Booking[] }>('/bookings/planning'), []);
  const requests = useFetch(() => api.get<{ bookings: Booking[] }>('/bookings?box=received&status=PENDING'), []);
  const mine = useFetch(() => api.get<{ offers: Offer[] }>('/offers/mine'), []);
  const suggestions = useFetch(() => api.get<{ offers: Offer[] }>('/offers/suggestions'), []);

  const now = new Date();
  const upcoming = (planning.data?.bookings ?? []).filter((b) => b.status !== 'COMPLETED' && new Date(b.endsAt) > now).slice(0, 4);
  const toConfirm = (planning.data?.bookings ?? []).filter((b) => b.can.confirm);
  const pendingCount = requests.data?.bookings.length ?? 0;
  const published = (mine.data?.offers ?? []).filter((o) => o.status === 'PUBLISHED');
  const drafts = (mine.data?.offers ?? []).filter((o) => o.status === 'DRAFT');
  const completed = (planning.data?.bookings ?? []).filter((b) => b.status === 'COMPLETED');

  const loading = planning.loading || requests.loading || mine.loading;
  if (loading && !planning.data) return <PageLoader />;

  return (
    <>
      <PageHeader
        title={`Bonjour ${user?.firstName ?? ''}`}
        subtitle="Voici l'essentiel de votre activité sur le campus."
        actions={<><Link to="/catalog" className="btn-secondary"><Compass className="h-4 w-4" />Catalogue</Link><Link to="/offers/new" className="btn-primary"><Plus className="h-4 w-4" />Proposer une séance</Link></>}
      />
      <ErrorBanner error={planning.error || requests.error || mine.error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Crédits disponibles</p><Wallet className="h-4 w-4 text-brand-600" /></div>
          <p className="mt-2 font-display text-3xl font-extrabold text-brand-700">{user?.availableCredits ?? 0}</p>
          <Link to="/wallet" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">Portefeuille<ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Crédits bloqués</p><Lock className="h-4 w-4 text-amber-500" /></div>
          <p className="mt-2 font-display text-3xl font-extrabold text-amber-600">{user?.blockedCredits ?? 0}</p>
          <p className="mt-1 text-xs text-ink-500">Séances acceptées en attente de réalisation</p>
        </div>
        <Link to="/requests" className="card p-5 transition hover:border-brand-200 hover:shadow-pop">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Demandes à traiter</p><Inbox className="h-4 w-4 text-ink-500" /></div>
          <p className="mt-2 font-display text-3xl font-extrabold">{pendingCount}</p>
          <p className="mt-1 text-xs text-ink-500">{pendingCount > 0 ? 'Répondez à vos bénéficiaires' : 'Aucune demande en attente'}</p>
        </Link>
        <Link to="/offers" className="card p-5 transition hover:border-brand-200 hover:shadow-pop">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Mes offres</p><Sparkles className="h-4 w-4 text-ink-500" /></div>
          <p className="mt-2 font-display text-3xl font-extrabold">{published.length}</p>
          <p className="mt-1 text-xs text-ink-500">{drafts.length > 0 ? `${drafts.length} brouillon(s) à publier` : `${completed.length} séance(s) réalisée(s)`}</p>
        </Link>
      </div>

      {toConfirm.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">{toConfirm.length} séance{toConfirm.length > 1 ? 's' : ''} terminée{toConfirm.length > 1 ? 's' : ''} en attente de votre confirmation.</p>
          <p className="mt-0.5 text-sm text-amber-800">Les crédits seront transférés après confirmation des deux participants.</p>
          <Link to="/planning" className="btn-secondary btn-sm mt-3">Voir mon planning</Link>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5 text-brand-600" />Prochaines séances</h2>
            <Link to="/planning" className="text-sm font-semibold text-brand-600 hover:underline">Tout voir</Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Aucune séance planifiée" text="Réservez une séance ou acceptez une demande pour remplir votre planning." action={<Link to="/catalog" className="btn-primary">Explorer le catalogue</Link>} />
          ) : (
            <div className="space-y-3">
              {upcoming.map((b) => {
                const other = b.myRole === 'TEACHER' ? b.learner : b.teacher;
                return (
                  <div key={b.id} className="card flex items-center gap-3 p-4">
                    <Avatar person={other} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{b.offer.title}</p>
                      <p className="truncate text-xs text-ink-500">{b.myRole === 'TEACHER' ? 'Vous animez' : `Avec ${fullName(other)}`} · {fmtRange(b.startsAt, b.endsAt)}</p>
                    </div>
                    <Pill tone={b.status === 'ACCEPTED' ? 'emerald' : 'amber'}>{b.status === 'ACCEPTED' ? 'Confirmée' : 'Litige'}</Pill>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Coins className="h-5 w-5 text-amber-500" />Suggestions</h2>
          {suggestions.data?.offers.length ? (
            <div className="space-y-3">
              {suggestions.data.offers.slice(0, 3).map((o) => (
                <Link key={o.id} to={`/offers/${o.id}`} className="card block p-4 transition hover:border-brand-200 hover:shadow-pop">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold">{o.title}</p>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">{o.cost} cr.</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">{o.skill} · {fullName(o.teacher)}</p>
                  <div className="mt-1.5"><Stars value={o.teacherRating?.avg ?? null} /></div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card p-5 text-sm text-ink-500">
              <p className="flex items-center gap-2 font-semibold text-ink-700"><Star className="h-4 w-4 text-amber-500" />Suggestions personnalisées</p>
              <p className="mt-1.5">Indiquez dans votre profil les compétences que vous recherchez : les offres correspondantes s'afficheront ici.</p>
              <Link to="/profile" className="btn-secondary btn-sm mt-3">Compléter mon profil</Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
