import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, EmptyState, Spinner } from '../components/ui.jsx'
import { apiGet } from '../lib/api.js'
import { formatDateHeure, MODES, NIVEAUX } from '../lib/format.js'

export default function Marche() {
  const [offres, setOffres] = useState(null)
  const [categories, setCategories] = useState([])
  const [erreur, setErreur] = useState('')
  const [filtres, setFiltres] = useState({ q: '', categorie: '', niveau: '', mode: '' })

  useEffect(() => {
    apiGet('/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams()
      Object.entries(filtres).forEach(([cle, valeur]) => {
        if (valeur) params.set(cle, valeur)
      })
      apiGet(`/offres?${params.toString()}`)
        .then((d) => setOffres(d.offres))
        .catch((err) => setErreur(err.message))
    }, 250)
    return () => clearTimeout(timeout)
  }, [filtres])

  const actifs = useMemo(
    () => Object.values(filtres).filter(Boolean).length,
    [filtres],
  )

  function update(champ) {
    return (e) => setFiltres((f) => ({ ...f, [champ]: e.target.value }))
  }

  return (
    <div className="space-y-5 fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Marché des compétences</h1>
          <p className="mt-1 text-sm text-ink-500">
            {offres?.length ?? 0} offre{(offres?.length ?? 0) > 1 ? 's' : ''} disponible{(offres?.length ?? 0) > 1 ? 's' : ''} sur le campus
          </p>
        </div>
        <Link to="/mes-offres" className="btn-primary">
          Publier une offre
        </Link>
      </header>

      <div className="card space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="input sm:flex-1"
            placeholder="Rechercher une compétence, un intervenant, une filière..."
            value={filtres.q}
            onChange={update('q')}
          />
          <select className="input sm:w-52" value={filtres.categorie} onChange={update('categorie')}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.nom}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={filtres.niveau} onChange={update('niveau')}>
            <option value="">Tous niveaux</option>
            {Object.entries(NIVEAUX).map(([cle, label]) => (
              <option key={cle} value={cle}>
                {label}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={filtres.mode} onChange={update('mode')}>
            <option value="">Tous les modes</option>
            {Object.entries(MODES).map(([cle, label]) => (
              <option key={cle} value={cle}>
                {label}
              </option>
            ))}
          </select>
          {actifs > 0 && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setFiltres({ q: '', categorie: '', niveau: '', mode: '' })}
            >
              Réinitialiser ({actifs})
            </button>
          )}
        </div>
      </div>

      {erreur && <Alert tone="error">{erreur}</Alert>}
      {!offres && !erreur && <Spinner />}

      {offres && offres.length === 0 && (
        <EmptyState
          title="Aucune offre ne correspond"
          description="Essaie d’élargir ta recherche ou publie ta propre compétence pour lancer un échange."
          action={
            <Link to="/mes-offres" className="btn-primary btn-sm">
              Publier une offre
            </Link>
          }
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {offres?.map((offre) => {
          const prochain = offre.creneaux.find((c) => c.statut === 'libre')
          return (
            <Link
              key={offre.id}
              to={`/offres/${offre.id}`}
              className="card group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="chip bg-brand-50 text-brand-700">{offre.categorie}</span>
                <span className="badge bg-ink-900 text-white">{offre.cout_credits} cr.</span>
              </div>
              <h2 className="text-base font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
                {offre.titre}
              </h2>
              <p className="line-clamp-2 text-sm text-ink-500">{offre.description}</p>
              <div className="mt-auto space-y-2 border-t border-ink-100 pt-3">
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <span>{offre.intervenant_nom}</span>
                  <span>{offre.filiere_intervenant || 'Campus'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="chip">{NIVEAUX[offre.niveau]}</span>
                  <span className="chip">{MODES[offre.mode]}</span>
                  <span className="chip">{offre.duree}</span>
                </div>
                <p className="text-xs font-medium text-ink-600">
                  {prochain ? `Prochain créneau : ${formatDateHeure(prochain.debut)}` : 'Aucun créneau libre'}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
