import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Spinner } from '../components/ui.jsx'
import { apiGet, apiPost } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { formatDateHeure, MODES, NIVEAUX } from '../lib/format.js'

export default function OffreDetail() {
  const { id } = useParams()
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [offre, setOffre] = useState(null)
  const [creneauId, setCreneauId] = useState('')
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [envoi, setEnvoi] = useState(false)

  function charger() {
    apiGet(`/offres/${id}`)
      .then((d) => {
        setOffre(d.offre)
        const libre = d.offre.creneaux.find((c) => c.statut === 'libre')
        setCreneauId(libre?.id || '')
      })
      .catch((err) => setErreur(err.message))
  }

  useEffect(() => {
    charger()
  }, [id])

  if (erreur && !offre) return <Alert tone="error">{erreur}</Alert>
  if (!offre) return <Spinner />

  const estMonOffre = offre.intervenant_id === user?.id
  const creneauxLibres = offre.creneaux.filter(
    (c) => c.statut === 'libre' && new Date(c.debut) > new Date(),
  )
  const soldeInsuffisant = (user?.solde_credits ?? 0) < offre.cout_credits

  async function reserver(e) {
    e.preventDefault()
    setErreur('')
    setSucces('')
    if (!creneauId) {
      setErreur('Choisis un créneau pour continuer.')
      return
    }
    setEnvoi(true)
    try {
      await apiPost('/reservations', { offre_id: offre.id, creneau_id: creneauId, message })
      await refresh()
      setSucces('Demande envoyée. L’intervenant doit la confirmer : suis l’avancement depuis tes réservations.')
      setMessage('')
      charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="space-y-5 fade-in">
      <Link to="/marche" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink-800">
        ← Retour au marché
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-brand-50 text-brand-700">{offre.categorie}</span>
            <span className="chip">{NIVEAUX[offre.niveau]}</span>
            <span className="chip">{MODES[offre.mode]}</span>
            <span className="chip">{offre.duree}</span>
            <Badge statut={offre.statut} />
          </div>

          <h1 className="mt-4 text-2xl leading-tight">{offre.titre}</h1>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">{offre.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-ink-50 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {offre.intervenant_nom
                .split(' ')
                .map((mot) => mot[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">{offre.intervenant_nom}</p>
              <p className="text-xs text-ink-500">{offre.filiere_intervenant || 'Etudiant du campus'}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs uppercase tracking-wide text-ink-400">Tarif</p>
              <p className="font-display text-xl text-brand-700">{offre.cout_credits} crédits</p>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink-900">Créneaux proposés</h2>
            <ul className="mt-2 divide-y divide-ink-100 text-sm">
              {offre.creneaux.length === 0 && <li className="py-3 text-ink-500">Aucun créneau pour l instant.</li>}
              {offre.creneaux.map((creneau) => (
                <li key={creneau.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-ink-700">{formatDateHeure(creneau.debut)}</span>
                  <span className="text-xs text-ink-500">{creneau.lieu}</span>
                  <Badge statut={creneau.statut} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="card h-fit p-6">
          <h2 className="text-base font-semibold">Réserver une session</h2>
          <p className="mt-1 text-xs text-ink-500">Ton solde : {user?.solde_credits ?? 0} crédits</p>

          {estMonOffre ? (
            <div className="mt-4 rounded-xl bg-ink-50 p-4 text-sm text-ink-600">
              C’est ton offre. Tu peux la modifier ou ajouter des créneaux depuis{' '}
              <Link to="/mes-offres" className="link">
                mes offres
              </Link>
              .
            </div>
          ) : (
            <form onSubmit={reserver} className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="creneau">
                  Creneau
                </label>
                <select
                  id="creneau"
                  className="input"
                  value={creneauId}
                  onChange={(e) => setCreneauId(e.target.value)}
                >
                  <option value="">Choisir un créneau</option>
                  {creneauxLibres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatDateHeure(c.debut)} · {c.lieu}
                    </option>
                  ))}
                </select>
                {creneauxLibres.length === 0 && (
                  <p className="field-error">Aucun créneau libre pour le moment.</p>
                )}
              </div>

              <div>
                <label className="label" htmlFor="message">
                  Message (optionnel)
                </label>
                <textarea
                  id="message"
                  rows={3}
                  className="input"
                  placeholder="Ce que tu veux apprendre en priorité..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {soldeInsuffisant && (
                <Alert tone="error">
                  Solde insuffisant : il te faut {offre.cout_credits} crédits. Donne une session pour en gagner.
                </Alert>
              )}
              {succes && <Alert tone="success">{succes}</Alert>}
              {erreur && <Alert tone="error">{erreur}</Alert>}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={envoi || soldeInsuffisant || creneauxLibres.length === 0}
              >
                {envoi ? 'Envoi...' : `Demander ce créneau (${offre.cout_credits} cr.)`}
              </button>
              <p className="text-center text-xs text-ink-400">
                Les crédits ne sont débités qu’après la confirmation de l’intervenant.
              </p>
            </form>
          )}

          <button type="button" className="btn-ghost mt-3 w-full" onClick={() => navigate('/reservations')}>
            Voir mes réservations
          </button>
        </aside>
      </div>
    </div>
  )
}
