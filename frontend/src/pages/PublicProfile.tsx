import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, GraduationCap, Star, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Profile, Review } from '../lib/types';
import { fmtFull, fullName } from '../lib/format';
import { Avatar, EmptyState, ErrorBanner, PageLoader, Pill, Stars } from '../components/ui';

export default function PublicProfile() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(() => api.get<{ profile: Profile; reviews: Review[] }>(`/profiles/${id}`), [id]);

  if (loading) return <PageLoader />;
  if (error || !data) return <><Link to="/catalog" className="btn-ghost -ml-3 mb-4"><ArrowLeft className="h-4 w-4" />Retour</Link><ErrorBanner error={error ?? new Error('Profil introuvable.')} /></>;
  const p = data.profile;

  return (
    <>
      <Link to="/catalog" className="btn-ghost -ml-3 mb-3"><ArrowLeft className="h-4 w-4" />Retour</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar person={p} size="lg" />
              <div>
                <h1 className="text-2xl font-extrabold">{fullName(p)}</h1>
                <p className="flex items-center gap-1.5 text-sm text-ink-500"><GraduationCap className="h-4 w-4" />{p.field}</p>
                <div className="mt-1.5 flex items-center gap-2"><Stars value={p.averageRating} /><span className="text-sm text-ink-500">{p.averageRating ? `${p.averageRating}/5 · ${p.reviewCount} avis` : 'Pas encore évalué'}</span></div>
              </div>
            </div>
            {p.bio && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-700">{p.bio}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Propose</p>
                <div className="flex flex-wrap gap-1.5">{p.offeredSkills.length ? p.offeredSkills.map((s) => <Pill key={s} tone="brand">{s}</Pill>) : <span className="text-sm text-ink-500">Aucune compétence indiquée.</span>}</div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Recherche</p>
                <div className="flex flex-wrap gap-1.5">{p.wantedSkills.length ? p.wantedSkills.map((s) => <Pill key={s}>{s}</Pill>) : <span className="text-sm text-ink-500">Aucune compétence indiquée.</span>}</div>
              </div>
            </div>
          </div>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Star className="h-5 w-5 text-amber-500" />Évaluations reçues</h2>
            {data.reviews.length === 0 ? <EmptyState icon={<Star className="h-6 w-6" />} title="Aucune évaluation" text="Les évaluations apparaissent après une séance réalisée." /> : (
              <div className="space-y-3">
                {data.reviews.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><Avatar person={r.reviewer} size="sm" /><span className="text-sm font-semibold">{fullName(r.reviewer)}</span></div>
                      <Stars value={r.rating} />
                    </div>
                    {r.comment && <p className="mt-2 text-sm text-ink-700">{r.comment}</p>}
                    <p className="mt-2 text-xs text-ink-500">{r.offerTitle} · {fmtFull(r.createdAt).split(' à')[0]}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Sur le campus</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-ink-500"><BookOpen className="h-4 w-4" />Séances animées</dt><dd className="font-bold">{p.sessionsTaught}</dd></div>
              <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-ink-500"><Users className="h-4 w-4" />Séances suivies</dt><dd className="font-bold">{p.sessionsAttended}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-ink-500">Offres publiées</dt><dd className="font-bold">{p.publishedOffers}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-ink-500">Membre depuis le {fmtFull(p.memberSince).split(' à')[0]}</p>
          </div>
          <Link to="/catalog" className="btn-primary w-full">Voir les séances disponibles</Link>
        </aside>
      </div>
    </>
  );
}
