import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, EmptyState, Modal, Spinner } from '../components/ui.jsx'
import { apiGet, apiPost } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { formatDateHeure, formatRelatif, MODES } from '../lib/format.js'

const ONGLETS = [
  { cle: 'tous', label: 'Toutes' },
  { cle: 'recues', label: 'Demandes reçues' },
  { cle: 'envoyees', label: 'Demandes envoyées' },
]

export default function Reservations() {
  const { refresh } = useAuth()
  const [onglet, setOnglet] = useState('tous')
  const [reservations, setReservations] = useState(null)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [action, setAction] = useState(null)
  const [enCours, setEnCours] = useState(false)

  function charger(cle = onglet) {
    apiGet(`/reservations?role=${cle}`)
      .then((d) => setReservations(d.reservations))
      .catch((err) => setErreur(err.message))
  }

  useEffect(() => {
    setReservations(null)
    charger(onglet)
  }, [onglet])

  // Le drapeau enCours empeche le double clic cote interface (le serveur reste la reference).
  async function executer(path, corps, messageSucces) {
    if (enCours) return
    setEnCours(true)
    setErreur('')
    setSucces('')
    try {
      await apiPost(path, corps)
      setSucces(messageSucces)
      setAction(null)
      charger()
      refresh()
    } catch (err) {
      setErreur(err.message)
      setAction(null)
    } finally {
      setEnCours(false)
    }
  }

  if (!reservations) return erreur ? <Alert tone="error">{erreur}</Alert> : <Spinner />

  return (
    <div className="space-y-5 fade-in">
      <header>
        <h1 className="text-2xl">Réservations</h1>
        <p className="mt-1 text-sm text-ink-500">
          Demandes reçues et envoyées, confirmation de réalisation, signalements et évaluations.
        </p>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 transition ${
              onglet === o.cle ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {succes && <Alert tone="success" onClose={() => setSucces('')}>{succes}</Alert>}
      {erreur && <Alert tone="error" onClose={() => setErreur('')}>{erreur}</Alert>}

      {reservations.length === 0 ? (
        <EmptyState
          title="Aucune réservation ici"
          description="Va sur le marché des compétences pour demander une séance, ou publie une offre pour recevoir des demandes."
          action={<Link to="/marche" className="btn-primary btn-sm">Explorer le marché</Link>}
        />
      ) : (
        <div className="space-y-4">
          {reservations.map((r) => (
            <Carte key={r.id} r={r} enCours={enCours} executer={executer} setAction={setAction} />
          ))}
        </div>
      )}

      <ModaleAction action={action} onClose={() => setAction(null)} onValider={executer} enCours={enCours} />
    </div>
  )
}

function Carte({ r, enCours, executer, setAction }) {
  const intervenant = r.mon_role === 'intervenant'
  const confirmations = `${r.confirme_intervenant ? '✓' : '○'} intervenant · ${r.confirme_beneficiaire ? '✓' : '○'} bénéficiaire`
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge statut={r.statut} />
            <span className="chip">{intervenant ? 'Tu animes' : 'Tu apprends'}</span>
            <span className="chip">{r.cout_credits} crédit{r.cout_credits > 1 ? 's' : ''}</span>
            {r.credits_bloques > 0 && <span className="chip bg-amber-50 text-amber-700">{r.credits_bloques} bloqué{r.credits_bloques > 1 ? 's' : ''}</span>}
            {['acceptee', 'en_litige'].includes(r.statut) && r.fin_passee && (
              <span className="chip bg-brand-50 text-brand-700">{confirmations}</span>
            )}
          </div>
          <h2 className="mt-2 text-base font-semibold text-ink-900">{r.offre_titre}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {formatDateHeure(r.debut)} · {r.duree_heures} h · {MODES[r.mode] || r.mode}
          </p>
          {r.lieu && (
            <p className="mt-1 text-sm text-ink-600">
              <span className="font-semibold">{r.mode === 'distance' ? 'Lien' : 'Lieu'} :</span>{' '}
              {/^https?:/.test(r.lieu) ? (
                <a href={r.lieu} target="_blank" rel="noreferrer" className="link break-all">{r.lieu}</a>
              ) : (
                r.lieu
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-400">
            Avec{' '}
            <Link to={`/etudiants/${r.autre_id}`} className="link">
              {intervenant ? r.beneficiaire_nom : r.intervenant_nom}
            </Link>{' '}
            · demande {formatRelatif(r.created_at)}
          </p>
          {r.message && <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-600">« {r.message} »</p>}
          {['refusee', 'annulee'].includes(r.statut) && r.motif_refus && (
            <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Motif : {r.motif_refus}</p>
          )}
          {r.litige && <BlocLitige litige={r.litige} />}
        </div>

        <div className="flex flex-wrap gap-2">
          {r.peut_accepter && (
            <button type="button" disabled={enCours} className="btn-accent btn-sm" onClick={() => executer(`/reservations/${r.id}/accepter`, {}, 'Demande acceptée. Les crédits du bénéficiaire sont bloqués.')}>
              Accepter
            </button>
          )}
          {r.peut_refuser && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAction({ type: 'refuser', r })}>Refuser</button>
          )}
          {r.peut_retirer && (
            <button type="button" disabled={enCours} className="btn-ghost btn-sm" onClick={() => executer(`/reservations/${r.id}/retirer`, {}, 'Demande retirée.')}>
              Retirer ma demande
            </button>
          )}
          {r.peut_annuler && (
            <button type="button" className="btn-danger btn-sm" onClick={() => setAction({ type: 'annuler', r })}>Annuler la séance</button>
          )}
          {r.peut_confirmer && (
            <button type="button" disabled={enCours} className="btn-primary btn-sm" onClick={() => executer(`/reservations/${r.id}/confirmer`, {}, 'Réalisation confirmée.')}>
              Confirmer la réalisation
            </button>
          )}
          {r.ma_confirmation && r.statut === 'acceptee' && <span className="chip bg-emerald-50 text-emerald-700">Tu as confirmé</span>}
          {r.peut_signaler && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAction({ type: 'signaler', r })}>
              {r.litige ? 'Ajouter ma version' : 'Signaler un problème'}
            </button>
          )}
          {r.peut_evaluer && (
            <button type="button" className="btn-accent btn-sm" onClick={() => setAction({ type: 'evaluer', r })}>Évaluer</button>
          )}
          {r.deja_evalue && <span className="chip bg-ink-50">Évaluation envoyée</span>}
        </div>
      </div>
    </article>
  )
}

function BlocLitige({ litige }) {
  return (
    <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-sm">
      <p className="font-semibold text-rose-800">
        Litige {litige.statut === 'ouvert' ? 'ouvert : crédits conservés en attente de décision' : 'réglé'}
      </p>
      <ul className="mt-2 space-y-1.5 text-rose-900">
        {litige.elements.map((e) => (
          <li key={e.id}>
            <span className="font-semibold">{e.auteur_nom}</span> ({e.type === 'absence' ? 'absence' : 'désaccord'}) : {e.texte}
          </li>
        ))}
      </ul>
      {litige.statut === 'regle' && (
        <p className="mt-2 rounded-lg bg-white/70 px-2 py-1.5 text-ink-700">
          Décision : {litige.decision === 'transfert' ? 'transfert intégral à l’intervenant' : 'restitution intégrale au bénéficiaire'}. {litige.motif_decision}
        </p>
      )}
    </div>
  )
}

const TITRES = {
  refuser: 'Refuser la demande',
  annuler: 'Annuler la séance',
  signaler: 'Signaler un problème',
  evaluer: 'Évaluer l’autre participant',
}

function ModaleAction({ action, onClose, onValider, enCours }) {
  const [texte, setTexte] = useState('')
  const [type, setType] = useState('absence')
  const [note, setNote] = useState(5)
  useEffect(() => {
    setTexte('')
    setType('absence')
    setNote(5)
  }, [action])
  if (!action) return null
  const { r } = action

  function submit(e) {
    e.preventDefault()
    if (action.type === 'refuser') onValider(`/reservations/${r.id}/refuser`, { motif: texte }, 'Demande refusée.')
    else if (action.type === 'annuler') onValider(`/reservations/${r.id}/annuler`, { motif: texte }, 'Séance annulée, crédits libérés.')
    else if (action.type === 'signaler') onValider(`/reservations/${r.id}/signaler`, { type, motif: texte }, 'Signalement transmis à l’administrateur.')
    else onValider(`/reservations/${r.id}/evaluer`, { note, commentaire: texte }, 'Merci pour ton évaluation.')
  }

  return (
    <Modal
      open
      title={TITRES[action.type]}
      description={r.offre_titre}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Fermer</button>
          <button type="submit" form="form-action" disabled={enCours} className="btn-primary">Valider</button>
        </>
      }
    >
      <form id="form-action" onSubmit={submit} className="space-y-3">
        {action.type === 'signaler' && (
          <div>
            <span className="label">Nature du problème</span>
            <div className="flex gap-2">
              {[['absence', 'Absence'], ['desaccord', 'Désaccord']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setType(v)} className={`btn-sm flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${type === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600'}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-500">Les crédits restent bloqués jusqu’à la décision de l’administrateur.</p>
          </div>
        )}
        {action.type === 'evaluer' && (
          <div>
            <span className="label">Note</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Note de 1 à 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={note === n} onClick={() => setNote(n)} className={`h-10 w-10 rounded-xl border text-sm font-semibold ${note >= n ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-ink-200 text-ink-400'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="label" htmlFor="texte">
            {action.type === 'evaluer' ? 'Commentaire (facultatif)' : 'Motif'}
          </label>
          <textarea
            id="texte"
            rows={4}
            className="input"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            required={['refuser', 'signaler'].includes(action.type)}
            minLength={action.type === 'signaler' ? 10 : action.type === 'refuser' ? 3 : undefined}
            placeholder={
              action.type === 'signaler' ? 'Décris ce qui s’est passé (10 caractères minimum).'
                : action.type === 'refuser' ? 'Pourquoi refuses-tu cette demande ?'
                  : action.type === 'annuler' ? 'Motif (facultatif)' : 'Partage ton retour sur la séance.'
            }
          />
        </div>
      </form>
    </Modal>
  )
}
