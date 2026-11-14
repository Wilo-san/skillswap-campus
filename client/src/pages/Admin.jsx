import { useEffect, useState } from 'react'
import { Alert, Badge, Spinner, StatCard } from '../components/ui.jsx'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'
import { formatDateHeure } from '../lib/format.js'

export default function Admin() {
  const [synthese, setSynthese] = useState(null)
  const [categories, setCategories] = useState([])
  const [litiges, setLitiges] = useState([])
  const [offres, setOffres] = useState([])
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [nouvelle, setNouvelle] = useState({ nom: '', description: '' })

  function charger() {
    Promise.all([
      apiGet('/admin/synthese'),
      apiGet('/categories'),
      apiGet('/admin/litiges'),
      apiGet('/admin/offres'),
    ])
      .then(([s, c, l, o]) => {
        setSynthese(s)
        setCategories(c.categories)
        setLitiges(l.litiges)
        setOffres(o.offres)
      })
      .catch((err) => setErreur(err.message))
  }

  useEffect(() => {
    charger()
  }, [])

  async function ajouterCategorie(e) {
    e.preventDefault()
    setErreur('')
    setSucces('')
    try {
      await apiPost('/categories', nouvelle)
      setNouvelle({ nom: '', description: '' })
      setSucces('Catégorie ajoutée.')
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function supprimerCategorie(categorie) {
    setErreur('')
    setSucces('')
    try {
      await apiDelete(`/categories/${categorie.id}`)
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function changerStatut(offre) {
    const statut = offre.statut === 'publiee' ? 'suspendue' : 'publiee'
    try {
      await apiPut(`/offres/${offre.id}`, { statut })
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function resoudre(litige) {
    const resolution = window.prompt('Résolution du litige (les crédits sont remboursés au bénéficiaire) :')
    if (resolution === null) return
    try {
      await apiPost(`/reservations/${litige.id}/resoudre`, { resolution, rembourser: true })
      setSucces('Litige résolu et crédits remboursés.')
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  if (erreur && !synthese) return <Alert tone="error">{erreur}</Alert>
  if (!synthese) return <Spinner />

  return (
    <div className="space-y-5 fade-in">
      <header>
        <h1 className="text-2xl">Administration</h1>
        <p className="mt-1 text-sm text-ink-500">Vue d’ensemble du campus, catégories et modération.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Étudiants" value={synthese.utilisateurs} tone="brand" />
        <StatCard label="Offres" value={synthese.offres} hint={`${synthese.offres_publiees} publiees`} tone="accent" />
        <StatCard label="Réservations" value={synthese.reservations} tone="ink" />
        <StatCard label="Litiges" value={synthese.litiges} tone="amber" />
        <StatCard label="Crédits" value={synthese.credits_en_circulation} hint="en circulation" tone="brand" />
        <StatCard label="Categories" value={categories.length} tone="ink" />
      </section>

      {succes && <Alert tone="success" onClose={() => setSucces('')}>{succes}</Alert>}
      {erreur && <Alert tone="error" onClose={() => setErreur('')}>{erreur}</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Categories</h2>
          <form onSubmit={ajouterCategorie} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="input sm:flex-1"
              placeholder="Nom"
              value={nouvelle.nom}
              onChange={(e) => setNouvelle({ ...nouvelle, nom: e.target.value })}
              required
            />
            <input
              className="input sm:flex-1"
              placeholder="Description"
              value={nouvelle.description}
              onChange={(e) => setNouvelle({ ...nouvelle, description: e.target.value })}
            />
            <button type="submit" className="btn-primary btn-sm">
              Ajouter
            </button>
          </form>
          <ul className="mt-4 divide-y divide-ink-100">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink-800">{c.nom}</p>
                  <p className="text-xs text-ink-400">
                    {c.description || 'Sans description'} · {c.offres} offre(s)
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-rose-600 hover:underline"
                  onClick={() => supprimerCategorie(c)}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">Litiges</h2>
          <ul className="mt-3 space-y-3">
            {litiges.length === 0 && <li className="text-sm text-ink-500">Aucun litige. Tout va bien.</li>}
            {litiges.map((l) => (
              <li key={l.id} className="rounded-xl border border-ink-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">{l.offre_titre}</p>
                  <Badge statut={l.statut} />
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {l.beneficiaire_nom} / {l.intervenant_nom} · {formatDateHeure(l.debut)}
                </p>
                {l.motif && <p className="mt-2 text-xs text-rose-700">Motif : {l.motif}</p>}
                {l.resolution && <p className="mt-1 text-xs text-emerald-700">Résolution : {l.resolution}</p>}
                {l.statut === 'litige' && (
                  <button type="button" className="btn-primary btn-sm mt-2" onClick={() => resoudre(l)}>
                    Résoudre et rembourser
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold">Toutes les offres</h2>
        </div>
        <ul className="divide-y divide-ink-100">
          {offres.map((offre) => (
            <li key={offre.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-800">{offre.titre}</p>
                <p className="text-xs text-ink-400">
                  {offre.intervenant_nom} · {offre.categorie} · {offre.cout_credits} cr. · {offre.reservations} reservation(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge statut={offre.statut} />
                <button type="button" className="btn-ghost btn-sm" onClick={() => changerStatut(offre)}>
                  {offre.statut === 'publiee' ? 'Suspendre' : 'Republier'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
