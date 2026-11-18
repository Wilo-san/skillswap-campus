import { useEffect, useState } from 'react';
import { Compass, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Category, Offer } from '../lib/types';
import OfferCard from '../components/OfferCard';
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../components/ui';
import { Link } from 'react-router-dom';

export default function Catalog() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [level, setLevel] = useState('');
  const [mode, setMode] = useState('');
  const [date, setDate] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);

  const cats = useFetch(() => api.get<{ categories: Category[] }>('/categories'), []);
  const suggestions = useFetch(() => api.get<{ offers: Offer[]; reason?: string }>('/offers/suggestions'), []);
  const params = new URLSearchParams();
  if (debounced) params.set('q', debounced);
  if (categoryId) params.set('categoryId', categoryId);
  if (level) params.set('level', level);
  if (mode) params.set('mode', mode);
  if (date) params.set('date', date);
  const qs = params.toString();
  const list = useFetch(() => api.get<{ offers: Offer[] }>(`/offers${qs ? `?${qs}` : ''}`), [qs]);
  const filtered = Boolean(qs);

  return (
    <>
      <PageHeader title="Catalogue" subtitle="Trouvez une séance auprès d'un autre étudiant. Seules les offres publiées avec un créneau futur disponible sont affichées." />

      {!filtered && suggestions.data && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-amber-500" />Suggestions pour vous</h2>
          {suggestions.data.offers.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{suggestions.data.offers.slice(0, 3).map((o) => <OfferCard key={o.id} offer={o} />)}</div>
          ) : (
            <div className="card flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-ink-700">
              <span>{suggestions.data.reason === 'NO_WANTED_SKILLS' ? 'Ajoutez les compétences que vous recherchez à votre profil pour recevoir des suggestions personnalisées.' : 'Aucune offre ne correspond pour le moment à vos compétences recherchées.'}</span>
              <Link to="/profile" className="btn-secondary btn-sm">Modifier mon profil</Link>
            </div>
          )}
        </section>
      )}

      <div className="card mb-6 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Rechercher une compétence, un titre…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Catégorie">
            <option value="">Toutes les catégories</option>
            {cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Niveau">
            <option value="">Tous les niveaux</option><option value="BEGINNER">Débutant</option><option value="INTERMEDIATE">Intermédiaire</option><option value="ADVANCED">Avancé</option>
          </select>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode de déroulement">
            <option value="">Tous les modes</option><option value="ONSITE">Présentiel</option><option value="REMOTE">À distance</option>
          </select>
          <input className="input" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        </div>
        {filtered && <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline" onClick={() => { setQ(''); setCategoryId(''); setLevel(''); setMode(''); setDate(''); }}><SlidersHorizontal className="h-3.5 w-3.5" />Réinitialiser les filtres</button>}
      </div>

      <ErrorBanner error={list.error} />
      {list.loading && !list.data ? <PageLoader /> : list.data && (
        list.data.offers.length === 0
          ? <EmptyState icon={<Compass className="h-6 w-6" />} title="Aucune offre ne correspond" text={filtered ? 'Essayez de modifier ou de réinitialiser vos filtres.' : "Aucune séance n'est proposée pour le moment. Revenez bientôt ou proposez la vôtre !"} action={<Link to="/offers/new" className="btn-primary">Proposer une séance</Link>} />
          : <><p className="mb-3 text-sm text-ink-500">{list.data.offers.length} offre{list.data.offers.length > 1 ? 's' : ''}</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.data.offers.map((o) => <OfferCard key={o.id} offer={o} />)}</div></>
      )}
    </>
  );
}
