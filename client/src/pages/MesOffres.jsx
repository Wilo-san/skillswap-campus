import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, EmptyState, Modal, Spinner } from '../components/ui.jsx'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'
import { formatDateHeure, formatHeure, MODES, NIVEAUX } from '../lib/format.js'

const VIDE = {
  titre: '',
  categorie: '',
  competence: '',
  description: '',
  niveau: 'debutant',
  duree_heures: 1,
  mode: 'presentiel',
}

export default function MesOffres() {
  const [offres, setOffres] = useState(null)
  const [categories, setCategories] = useState([])
  const [demandes, setDemandes] = useState([])
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [modale, setModale] = useState(null)
  const [form, setForm] = useState(VIDE)
  const [envoi, setEnvoi] = useState(false)
  const [creneauForm, setCreneauForm] = useState({ debut: '', lieu: '' })
  const [offreCreneau, setOffreCreneau] = useState(null)

  function charger() {
    Promise.all([apiGet('/offres?intervenant=me&statut=tous'), apiGet('/categories'), apiGet('/reservations?role=recues')])
      .then(([o, c, r]) => {
        setOffres(o.offres)
        setCategories(c.categories)
        setDemandes(r.reservations.filter((x) => x.statut === 'en_attente'))
      })
      .catch((err) => setErreur(err.message))
  }
  useEffect(charger, [])

  const update = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }))

  function ouvrirCreation() {
    setErreur('')
    setForm({ ...VIDE, categorie: categories[0]?.nom || '' })
    setModale({ type: 'creation' })
  }

  function ouvrirEdition(o) {
    setErreur('')
    setForm({ titre: o.titre, categorie: o.categorie, competence: o.competence, description: o.description, niveau: o.niveau, duree_heures: o.duree_heures, mode: o.mode })
    setModale({ type: 'edition', id: o.id })
  }

  async function enregistrer(e, publier = false) {
    e.preventDefault()
    if (envoi) return
    setErreur('')
    setEnvoi(true)
    try {
      const corps = { ...form, duree_heures: Number(form.duree_heures) }
      if (modale?.type === 'edition') await apiPut(`/offres/${modale.id}`, corps)
      else await apiPost('/offres', { ...corps, statut: publier ? 'publiee' : 'brouillon' })
      setModale(null)
      setSucces(modale?.type === 'edition' ? 'Offre modifiée.' : publier ? 'Offre publiée.' : 'Brouillon enregistré. Ajoute un créneau puis publie-le.')
      charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function changerStatut(o, statut) {
    setErreur('')
    try {
      await apiPut(`/offres/${o.id}`, { statut })
      setSucces(statut === 'publiee' ? 'Offre publiée.' : 'Offre archivée : les demandes en attente ont été annulées.')
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function supprimer(o) {
    if (!window.confirm(`Supprimer définitivement « ${o.titre} » ?`)) return
    try {
      await apiDelete(`/offres/${o.id}`)
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function ajouterCreneau(e) {
    e.preventDefault()
    if (envoi) return
    setErreur('')
    setEnvoi(true)
    try {
      await apiPost(`/offres/${offreCreneau.id}/creneaux`, { debut: new Date(creneauForm.debut).toISOString(), lieu: creneauForm.lieu })
      setCreneauForm({ debut: '', lieu: '' })
      setOffreCreneau(null)
      charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function supprimerCreneau(c) {
    setErreur('')
    try {
      await apiDelete(`/creneaux/${c.id}`)
      charger()
    } catch (err) {
      setErreur(err.message)
    }
  }

  async function traiter(r, action, corps = {}) {
    setErreur('')
    try {
      await apiPost(`/reservations/${r.id}/${action}`, corps)
      setSucces(action === 'accepter' ? 'Demande acceptée.' : 'Demande refusée.')
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
          <p className="mt-1 text-sm text-ink-500">Crée une offre, ajoute des créneaux, puis publie-la. Tu gagnes 1 crédit par heure animée.</p>
        </div>
        <button type="button" className="btn-primary" onClick={ouvrirCreation}>Nouvelle offre</button>
      </header>

      {succes && <Alert tone="success" onClose={() => setSucces('')}>{succes}</Alert>}
      {erreur && !modale && !offreCreneau && <Alert tone="error" onClose={() => setErreur('')}>{erreur}</Alert>}

      {demandes.length > 0 && (
        <section className="card border-amber-200 bg-amber-50/40 p-5">
          <h2 className="text-lg">Demandes reçues à traiter ({demandes.length})</h2>
          <ul className="mt-3 divide-y divide-amber-100">
            {demandes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-ink-900">{r.offre_titre}</p>
                  <p className="text-ink-500">{r.beneficiaire_nom} · {formatDateHeure(r.debut)}</p>
                  {r.message && <p className="mt-1 text-xs text-ink-500">« {r.message} »</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-accent btn-sm" onClick={() => traiter(r, 'accepter')}>Accepter</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { const m = window.prompt('Motif du refus (obligatoire) :'); if (m) traiter(r, 'refuser', { motif: m }) }}>Refuser</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {offres.length === 0 ? (
        <EmptyState
          title="Tu n’as pas encore d’offre"
          description="Propose ce que tu maîtrises : un langage, une langue, une méthode. Tu gagnes des crédits à chaque séance animée."
          action={<button type="button" className="btn-primary btn-sm" onClick={ouvrirCreation}>Créer ma première offre</button>}
        />
      ) : (
        <div className="space-y-4">
          {offres.map((o) => {
            const peutPublier = o.statut !== 'publiee' && !o.masquee
            return (
              <article key={o.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge statut={o.statut} />
                      {o.masquee && <Badge statut="masquee" />}
                      <span className="chip">{o.categorie}</span>
                      <span className="chip">{NIVEAUX[o.niveau]}</span>
                      <span className="chip">{MODES[o.mode]}</span>
                      <span className="chip">{o.duree_heures} h · {o.cout_credits} crédit{o.cout_credits > 1 ? 's' : ''}</span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-ink-900">{o.titre}</h2>
                    <p className="mt-1 text-sm text-ink-500">{o.competence}</p>
                    {o.masquee && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Masquée par un administrateur : {o.motif_masquage}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setOffreCreneau(o)}>Ajouter un créneau</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => ouvrirEdition(o)}>Modifier</button>
                    {peutPublier && <button type="button" className="btn-accent btn-sm" onClick={() => changerStatut(o, 'publiee')}>Publier</button>}
                    {o.statut === 'publiee' && <button type="button" className="btn-ghost btn-sm" onClick={() => changerStatut(o, 'archivee')}>Archiver</button>}
                    <button type="button" className="btn-danger btn-sm" onClick={() => supprimer(o)}>Supprimer</button>
                  </div>
                </div>

                <div className="mt-4 border-t border-ink-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Créneaux ({o.creneaux.length})</p>
                  {o.creneaux.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-400">Aucun créneau : ajoute-en un avant de publier.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {o.creneaux.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-ink-700">{formatDateHeure(c.debut)} → {formatHeure(c.fin)} · <span className="text-ink-500">{c.lieu}</span></span>
                          <span className="flex items-center gap-2">
                            <Badge statut={c.statut === 'libre' ? 'libre' : 'reserve'} />
                            {c.statut === 'libre' && <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => supprimerCreneau(c)}>Retirer</button>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(modale)}
        title={modale?.type === 'edition' ? 'Modifier l’offre' : 'Nouvelle offre'}
        description="La durée fixe le coût : 1 h = 1 crédit, 2 h = 2 crédits."
        onClose={() => setModale(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModale(null)}>Fermer</button>
            {modale?.type === 'edition' ? (
              <button type="submit" form="form-offre" disabled={envoi} className="btn-primary">Enregistrer</button>
            ) : (
              <>
                <button type="submit" form="form-offre" disabled={envoi} className="btn-ghost">Enregistrer en brouillon</button>
                <button type="button" disabled={envoi} className="btn-primary" onClick={(e) => enregistrer(e, true)}>Publier</button>
              </>
            )}
          </>
        }
      >
        {erreur && <div className="mb-3"><Alert tone="error">{erreur}</Alert></div>}
        <form id="form-offre" onSubmit={enregistrer} className="space-y-3">
          <div>
            <label className="label" htmlFor="titre">Titre</label>
            <input id="titre" className="input" value={form.titre} onChange={update('titre')} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="categorie">Catégorie</label>
              <select id="categorie" className="input" value={form.categorie} onChange={update('categorie')} required>
                {categories.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="competence">Compétence</label>
              <input id="competence" className="input" value={form.competence} onChange={update('competence')} placeholder="SQL, React, UML" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea id="description" rows={4} className="input" value={form.description} onChange={update('description')} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="niveau">Niveau</label>
              <select id="niveau" className="input" value={form.niveau} onChange={update('niveau')}>
                {Object.entries(NIVEAUX).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="duree">Durée</label>
              <select id="duree" className="input" value={form.duree_heures} onChange={update('duree_heures')}>
                <option value={1}>1 heure (1 crédit)</option>
                <option value={2}>2 heures (2 crédits)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mode">Mode</label>
              <select id="mode" className="input" value={form.mode} onChange={update('mode')}>
                {Object.entries(MODES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(offreCreneau)}
        title="Ajouter un créneau"
        description={offreCreneau ? `${offreCreneau.titre} · durée ${offreCreneau.duree_heures} h, l’heure de fin est calculée.` : ''}
        onClose={() => setOffreCreneau(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOffreCreneau(null)}>Fermer</button>
            <button type="submit" form="form-creneau" disabled={envoi} className="btn-primary">Ajouter</button>
          </>
        }
      >
        {erreur && <div className="mb-3"><Alert tone="error">{erreur}</Alert></div>}
        <form id="form-creneau" onSubmit={ajouterCreneau} className="space-y-3">
          <div>
            <label className="label" htmlFor="debut">Début</label>
            <input id="debut" type="datetime-local" className="input" value={creneauForm.debut} onChange={(e) => setCreneauForm({ ...creneauForm, debut: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="lieu">{offreCreneau?.mode === 'distance' ? 'Lien de réunion' : 'Lieu'}</label>
            <input id="lieu" className="input" value={creneauForm.lieu} onChange={(e) => setCreneauForm({ ...creneauForm, lieu: e.target.value })} placeholder={offreCreneau?.mode === 'distance' ? 'https://meet.google.com/...' : 'Salle B2, bibliothèque...'} required />
            <p className="mt-1 text-xs text-ink-500">Visible uniquement par les participants de la séance.</p>
          </div>
        </form>
      </Modal>
    </div>
  )
}
