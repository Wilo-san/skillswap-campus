import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, EmptyState, Modal, Spinner } from '../components/ui.jsx'
import { apiGet, apiPost } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { formatDateHeure, formatRelatif } from '../lib/format.js'

const ONGLETS = [
  { cle: 'tous', label: 'Toutes' },
  { cle: 'recues', label: 'Demandes reçues' },
  { cle: 'envoyees', label: 'Mes demandes' },
]

export default function Reservations() {
  const { user, refresh } = useAuth()
  const [onglet, setOnglet] = useState('tous')
  const [reservations, setReservations] = useState(null)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [modale, setModale] = useState(null)
  const [action, setAction] = useState(null)

  function charger(cle = onglet) {
    apiGet(`/reservations?role=${cle}`)
      .then((d) => setReservations(d.reservations))
      .catch((err) => setErreur(err.message))
  }

  useEffect(() => {
    setReservations(null)
    charger(onglet)
  }, [onglet])

  async function executer(path, corps, messageSucces) {
    setErreur('')
    setSucces('')
    try {
      await apiPost(path, corps)
      setSucces(messageSucces)
      setModale(null)
      setAction(null)
      charger()
      refresh()
    } catch (err) {
      setErreur(err.message)
    }
  }

  if (!reservations) return erreur ? <Alert tone="error">{erreur}</Alert> : <Spinner />

  return (
    <div className="space-y-5 fade-in">
      <header>
        <h1 className="text-2xl">Réservations</h1>
        <p className="mt-1 text-sm text-ink-500">
          Confirmations, annulations et litiges de tes sessions.
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
          description="Va sur le marché des compétences pour réserver un créneau, ou publie une offre pour recevoir des demandes."
          action={
            <Link to="/marche" className="btn-primary btn-sm">
              Explorer le marché
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {reservations.map((resa) => {
            const jeSuisIntervenant = resa.intervenant_id === user?.id
            const jeSuisBeneficiaire = resa.beneficiaire_id === user?.id
            return (
              <article key={resa.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge statut={resa.statut} />
                      <span className="chip">{jeSuisIntervenant ? 'Tu enseignes' : 'Tu apprends'}</span>
                      <span className="chip">{resa.cout} crédits</span>
                      {resa.statut === 'en_attente' && (
                        <span className="chip bg-amber-50 text-amber-700">
                          {resa.confirme_intervenant ? 'Intervenant OK' : 'Intervenant en attente'} ·{' '}
                          {resa.confirme_beneficiaire ? 'Bénéficiaire OK' : 'Bénéficiaire en attente'}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-ink-900">{resa.offre_titre}</h2>
                    <p className="mt-1 text-sm text-ink-500">
                      {formatDateHeure(resa.debut)} · {resa.lieu}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {jeSuisIntervenant ? `Avec ${resa.beneficiaire_nom}` : `Avec ${resa.intervenant_nom}`} · demande{' '}
                      {formatRelatif(resa.created_at)}
                    </p>
                    {resa.message && (
                      <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-600">« {resa.message} »</p>
                    )}
                    {resa.motif && (
                      <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Motif : {resa.motif}</p>
                    )}
                    {resa.resolution && (
                      <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Résolution : {resa.resolution}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {resa.statut === 'en_attente' && jeSuisIntervenant && (
                      <>
                        <button
                          type="button"
                          className="btn-accent btn-sm"
                          onClick={() => executer(`/reservations/${resa.id}/confirmer`, {}, 'Réservation confirmée. Les crédits ont été transférés.')}
                        >
                          Confirmer
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setAction({ type: 'refuser', resa })}
                        >
                          Refuser
                        </button>
                      </>
                    )}
                    {resa.statut === 'en_attente' && jeSuisBeneficiaire && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => executer(`/reservations/${resa.id}/annuler`, {}, 'Demande annulée.')}
                      >
                        Annuler la demande
                      </button>
                    )}
                    {resa.statut === 'confirmee' && (
                      <>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setAction({ type: 'litige', resa })}
                        >
                          Signaler un problème
                        </button>
                        {jeSuisBeneficiaire && (
                          <button
                            type="button"
                            className="btn-danger btn-sm"
                            onClick={() => executer(`/reservations/${resa.id}/annuler`, {}, 'Session annulée et crédits remboursés.')}
                          >
                            Annuler
                          </button>
                        )}
                      </>
                    )}
                    {resa.statut === 'litige' && (jeSuisIntervenant || user?.role === 'admin') && (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => setAction({ type: 'resoudre', resa })}
                      >
                        Resoudre
                      </button>
                    )}
                    <Link to={`/offres/${resa.offre_id}`} className="btn-ghost btn-sm">
                      Voir l’offre
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={action !== null}
        title={
          action?.type === 'refuser'
            ? 'Refuser la demande'
            : action?.type === 'litige'
              ? 'Signaler un problème'
              : 'Résoudre le litige'
        }
        description={action?.resa?.offre_titre}
        onClose={() => setAction(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setAction(null)}>
              Annuler
            </button>
            <button type="submit" form="form-action" className="btn-primary">
              Valider
            </button>
          </>
        }
      >
        <ActionForm action={action} onValider={executer} />
      </Modal>
    </div>
  )
}

function ActionForm({ action, onValider }) {
  const [texte, setTexte] = useState('')
  const [rembourser, setRembourser] = useState(true)
  if (!action) return null

  function onSubmit(e) {
    e.preventDefault()
    const id = action.resa.id
    if (action.type === 'refuser') onValider(`/reservations/${id}/refuser`, { motif: texte }, 'Demande refusée.')
    else if (action.type === 'litige') onValider(`/reservations/${id}/litige`, { motif: texte }, 'Litige signalé.')
    else onValider(`/reservations/${id}/resoudre`, { resolution: texte, rembourser }, 'Litige résolu.')
  }

  return (
    <form id="form-action" onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label" htmlFor="texte">
          {action.type === 'resoudre' ? 'Resolution' : 'Motif'}
        </label>
        <textarea
          id="texte"
          rows={4}
          className="input"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={
            action.type === 'resoudre'
              ? 'Ce qui a été décidé...'
              : action.type === 'litige'
                ? 'Explique ce qui ne s’est pas passé comme prévu (10 caractères minimum).'
                : 'Pourquoi refuses-tu ce créneau ?'
          }
          required={action.type !== 'refuser'}
          minLength={action.type === 'litige' ? 10 : undefined}
        />
      </div>
      {action.type === 'resoudre' && (
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={rembourser}
            onChange={(e) => setRembourser(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-600"
          />
          Rembourser les crédits au bénéficiaire
        </label>
      )}
    </form>
  )
}
