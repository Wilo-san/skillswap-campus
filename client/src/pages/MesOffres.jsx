import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, EmptyState, Modal, Spinner } from '../components/ui.jsx'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'
import { formatDateHeure, MODES, NIVEAUX, toInputDateTime } from '../lib/format.js'

const VIDE = {
  titre: '',
  categorie: '',
  competence: '',
  description: '',
  niveau: 'intermediaire',
  duree: '1h',
  mode: 'presentiel',
  cout_credits: 1,
}

export default function MesOffres() {
  const [offres, setOffres] = useState(null)
  const [categories, setCategories] = useState([])
  const [erreur, setErreur] = useState('')
  const [modale, setModale] = useState(null)
  const [form, setForm] = useState(VIDE)
  const [envoi, setEnvoi] = useState(false)
  const [creneauForm, setCreneauForm] = useState({ debut: '', fin: '', lieu: '' })
  const [offreCreneau, setOffreCreneau] = useState(null)

  function charger() {
    Promise.all([apiGet('/offres?intervenant=me&statut=tous'), apiGet('/categories')])
      .then(([o, c]) => {
        setOffres(o.offres)
        setCategories(c.categories)
      })
      .catch((err) => setErreur(err.message))
  }

  useEffect(() => {
    charger()
  }, [])

  function ouvrirCreation() {
    setForm({ ...VIDE, categorie: categories[0]?.nom || '' })
    setModale('creation')
  }

  function ouvrirEdition(offre) {
    setForm({
      titre: offre.titre,
      categorie: offre.categorie,
      competence: offre.competence,
      description: offre.description,
      niveau: offre.niveau,
      duree: offre.duree,
      mode: offre.mode,
      cout_credits: offre.cout_credits,
    })
    setModale({ type: 'edition', id: offre.id })
  }

  async function enregistrer(e) {
    e.preventDefault()
    setErreur('')
    setEnvoi(true)
    try {
      if (modale?.type === 'edition') await apiPut(`/offres/${modale.id}`, form)
      else await apiPost('/offres', form)
      setModale(null)
      charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function archiver(offre) {
    const statut = offre.statut === 'publiee' ? 'archivee' : 'publiee'
    try {
      await apiPut(`/offres/${offre.id}`, { statut })
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function supprimer(offre) {
    if (!window.confirm(`Supprimer definitivement « ${offre.titre} » ?`)) return
    try {
      await apiDelete(`/offres/${offre.id}`)
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function ajouterCreneau(e) {
    e.preventDefault()
    setErreur('')
    setEnvoi(true)
    try {
      await apiPost(`/offres/${offreCreneau.id}/creneaux`, creneauForm)
      setCreneauForm({ debut: '', fin: '', lieu: '' })
      setOffreCreneau(null)
      charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function supprimerCreneau(creneau) {
    try {
      await apiDelete(`/creneaux/${creneau.id}`)
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  if (!offres) return erreur ? <Alert tone="error">{erreur}</Alert> : <Spinner />

  return (
    <div className="space-y-5 fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Mes offres</h1>
          <p className="mt-1 text-sm text-ink-500">
            {offres.filter((o) => o.statut === 'publiee').length} publiée(s) sur {offres.length}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={ouvrirCreation}>
          Nouvelle offre
        </button>
      </header>

      {erreur && <Alert tone="error" onClose={() => setErreur('')}>{erreur}</Alert>}

      {offres.length === 0 ? (
        <EmptyState
          title="Tu n’as pas encore publié de compétence"
          description="Propose ce que tu maîtrises : une langue, un langage de programmation, une méthode. Tu gagnes des crédits à chaque session donnée."
          action={
            <button type="button" className="btn-primary btn-sm" onClick={ouvrirCreation}>
              Créer ma première offre
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {offres.map((offre) => (
            <article key={offre.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge statut={offre.statut} />
                    <span className="chip">{offre.categorie}</span>
                    <span className="chip">{offre.cout_credits} crédits</span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-ink-900">{offre.titre}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">{offre.description || 'Pas de description.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => ouvrirEdition(offre)}>
                    Modifier
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setOffreCreneau(offre)}>
                    Créneaux
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => archiver(offre)}>
                    {offre.statut === 'publiee' ? 'Archiver' : 'Republier'}
                  </button>
                  <button type="button" className="btn-danger btn-sm" onClick={() => supprimer(offre)}>
                    Supprimer
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 border-t border-ink-100 pt-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Créneaux ({offre.creneaux.length})
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {offre.creneaux.length === 0 && <li className="text-ink-500">Aucun créneau</li>}
                    {offre.creneaux.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span className="text-ink-600">{formatDateHeure(c.debut)}</span>
                        <span className="flex items-center gap-2">
                          <Badge statut={c.statut} />
                          {c.statut === 'libre' && (
                            <button
                              type="button"
                              className="text-xs font-semibold text-rose-600 hover:underline"
                              onClick={() => supprimerCreneau(c)}
                            >
                              Retirer
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1 text-xs text-ink-500">
                  <p>Niveau : {NIVEAUX[offre.niveau]}</p>
                  <p>Mode : {MODES[offre.mode]}</p>
                  <p>Durée : {offre.duree}</p>
                  <p>{offre.reservations} reservation(s) en cours</p>
                  <Link to={`/offres/${offre.id}`} className="link inline-block">
                    Voir la fiche publique
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modale !== null}
        title={modale?.type === 'edition' ? "Modifier l'offre" : 'Nouvelle offre'}
        description="Décris précisément ce que tu proposes : c’est ce que les autres étudiants verront."
        onClose={() => setModale(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModale(null)}>
              Annuler
            </button>
            <button type="submit" form="form-offre" className="btn-primary" disabled={envoi}>
              {envoi ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </>
        }
      >
        <form id="form-offre" onSubmit={enregistrer} className="space-y-3">
          <div>
            <label className="label" htmlFor="titre">
              Titre
            </label>
            <input
              id="titre"
              className="input"
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="competence">
                Competence
              </label>
              <input
                id="competence"
                className="input"
                placeholder="SQL, React, Arduino..."
                value={form.competence}
                onChange={(e) => setForm({ ...form, competence: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="categorie">
                Catégorie
              </label>
              <select
                id="categorie"
                className="input"
                value={form.categorie}
                onChange={(e) => setForm({ ...form, categorie: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.nom}>
                    {c.nom}
                  </option>
                ))}
                <option value="Autre">Autre</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="niveau">
                Niveau
              </label>
              <select
                id="niveau"
                className="input"
                value={form.niveau}
                onChange={(e) => setForm({ ...form, niveau: e.target.value })}
              >
                {Object.entries(NIVEAUX).map(([cle, label]) => (
                  <option key={cle} value={cle}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mode">
                Mode
              </label>
              <select
                id="mode"
                className="input"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                {Object.entries(MODES).map(([cle, label]) => (
                  <option key={cle} value={cle}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="duree">
                Durée
              </label>
              <select
                id="duree"
                className="input"
                value={form.duree}
                onChange={(e) => setForm({ ...form, duree: e.target.value })}
              >
                {['30min', '1h', '1h30', '2h', '3h'].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cout">
                Coût en crédits
              </label>
              <input
                id="cout"
                type="number"
                min="1"
                max="5"
                className="input"
                value={form.cout_credits}
                onChange={(e) => setForm({ ...form, cout_credits: Number(e.target.value) })}
              />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={offreCreneau !== null}
        title="Ajouter un créneau"
        description={offreCreneau?.titre}
        onClose={() => setOffreCreneau(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOffreCreneau(null)}>
              Fermer
            </button>
            <button type="submit" form="form-creneau" className="btn-primary" disabled={envoi}>
              {envoi ? 'Ajout...' : 'Ajouter'}
            </button>
          </>
        }
      >
        <form id="form-creneau" onSubmit={ajouterCreneau} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="debut">
                Debut
              </label>
              <input
                id="debut"
                type="datetime-local"
                className="input"
                value={toInputDateTime(creneauForm.debut)}
                onChange={(e) => setCreneauForm({ ...creneauForm, debut: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="fin">
                Fin
              </label>
              <input
                id="fin"
                type="datetime-local"
                className="input"
                value={toInputDateTime(creneauForm.fin)}
                onChange={(e) => setCreneauForm({ ...creneauForm, fin: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="lieu">
              Lieu
            </label>
            <input
              id="lieu"
              className="input"
              placeholder="Salle B2, Discord, Google Meet..."
              value={creneauForm.lieu}
              onChange={(e) => setCreneauForm({ ...creneauForm, lieu: e.target.value })}
            />
          </div>
          <p className="text-xs text-ink-400">
            Astuce : ajoute plusieurs créneaux pour multiplier tes chances qu’une demande arrive.
          </p>
        </form>
      </Modal>
    </div>
  )
}
