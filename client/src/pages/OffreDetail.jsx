import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Spinner } from '../components/ui.jsx'
import { apiGet, apiPost } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { formatDateHeure, formatHeure, MODES, NIVEAUX } from '../lib/format.js'

export default function OffreDetail() {
  const { id } = useParams()
  const { user, refresh } = useAuth()
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
        const libre = d.offre.creneaux.find((c) => c.statut === 'libre' && new Date(c.debut) > new Date())
        setCreneauId(libre?.id || '')
      })
      .catch((err) => setErreur(err.message))
  }

  useEffect(charger, [id])

  if (erreur && !offre) return <Alert tone="error">{erreur}</Alert>
  if (!offre) return <Spinner />

  const estMonOffre = offre.intervenant_id === user?.id
  const libres = offre.creneaux.filter((c) => c.statut === 'libre' && new Date(c.debut) > new Date())
  const soldeInsuffisant = (user?.solde_credits ?? 0) < offre.cout_credits
  const indisponible = offre.statut !== 'publiee' || offre.masquee

  async function reserver(e) {
    e.preventDefault()
    if (envoi) return // anti double clic
    setErreur('')
    setSucces('')
    if (!creneauId) return setErreur('Choisis un créneau pour continuer.')
    setEnvoi(true)
    try {
      await apiPost('/reservations', { creneau_id: creneauId, message })
      await refresh()
      setSucces('Demande envoyée. Aucun crédit n’est bloqué avant l’acceptation de l’intervenant.')
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
      <Link to="/marche" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink-800">← Retour au marché</Link>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-brand-50 text-brand-700">{offre.categorie}</span>
            <span className="chip">{offre.competence}</span>
            <span className="chip">{NIVEAUX[offre.niveau]}</span>
            <span className="chip">{MODES[offre.mode]}</span>
            <span className="chip">{offre.duree_heures} h</span>
            {estMonOffre && <Badge statut={offre.statut} />}
            {offre.masquee && <Badge statut="masquee" />}
          </div>
          <h1 className="mt-4 text-2xl leading-tight">{offre.titre}</h1>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">{offre.description}</p>

          <Link to={`/etudiants/${offre.intervenant_id}`} className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-ink-50 p-4 transition hover:bg-ink-100">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {offre.intervenant_nom.split(' ').map((m) => m[0]).join('').slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">{offre.intervenant_nom}</p>
              <p className="text-xs text-ink-500">
                {offre.filiere_intervenant || 'Étudiant du campus'} ·{' '}
                {offre.intervenant_note != null ? `★ ${offre.intervenant_note} (${offre.intervenant_nb_notes} avis)` : 'pas encore évalué'}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs uppercase tracking-wide text-ink-400">Coût</p>
              <p className="font-display text-xl text-brand-700">{offre.cout_credits} crédit{offre.cout_credits > 1 ? 's' : ''}</p>
            </div>
          </Link>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-ink-900">Créneaux</h2>
            <ul className="mt-2 divide-y divide-ink-100 text-sm">
              {offre.creneaux.length === 0 && <li className="py-3 text-ink-500">Aucun créneau pour l’instant.</li>}
              {offre.creneaux.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="text-ink-700">
                    {formatDateHeure(c.debut)} → {formatHeure(c.fin)}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-500">
                    {c.lieu ? c.lieu : <em>Lieu communiqué aux participants</em>}
                    <Badge statut={c.statut === 'libre' ? 'libre' : 'reserve'} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="card h-fit space-y-4 p-6">
          <h2 className="text-lg">Demander une séance</h2>
          <p className="text-xs text-ink-500">
            Ton solde : <strong>{user?.solde_credits ?? 0}</strong> disponible{(user?.solde_credits ?? 0) > 1 ? 's' : ''}, {user?.credits_bloques ?? 0} bloqué{(user?.credits_bloques ?? 0) > 1 ? 's' : ''}.
            Les crédits ne sont bloqués qu’à l’acceptation.
          </p>
          {succes && <Alert tone="success" onClose={() => setSucces('')}>{succes} <Link to="/reservations" className="link">Voir mes demandes</Link></Alert>}
          {erreur && <Alert tone="error" onClose={() => setErreur('')}>{erreur}</Alert>}

          {estMonOffre ? (
            <Alert tone="info">C’est ton offre. Gère-la depuis <Link to="/mes-offres" className="link">Mes offres</Link>.</Alert>
          ) : indisponible ? (
            <Alert tone="info">Cette offre n’accepte plus de demandes.</Alert>
          ) : (
            <form onSubmit={reserver} className="space-y-3">
              <div>
                <label className="label" htmlFor="creneau">Créneau</label>
                <select id="creneau" className="input" value={creneauId} onChange={(e) => setCreneauId(e.target.value)}>
                  {libres.length === 0 && <option value="">Aucun créneau libre</option>}
                  {libres.map((c) => <option key={c.id} value={c.id}>{formatDateHeure(c.debut)} → {formatHeure(c.fin)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="message">Message (facultatif)</label>
                <textarea id="message" rows={3} className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ce que tu veux apprendre en priorité..." maxLength={500} />
              </div>
              {soldeInsuffisant && (
                <p className="field-error">Solde insuffisant : il te faut {offre.cout_credits} crédit{offre.cout_credits > 1 ? 's' : ''}. Anime une séance pour en gagner.</p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={envoi || soldeInsuffisant || libres.length === 0}>
                {envoi ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  )
}
