import { useEffect, useState } from 'react'
import { Alert, Badge, EmptyState, Modal, Spinner, StatCard } from '../components/ui.jsx'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'
import { formatDateHeure } from '../lib/format.js'

const ONGLETS = [
  ['synthese', 'Tableau de bord'],
  ['litiges', 'Litiges'],
  ['offres', 'Modération'],
  ['comptes', 'Comptes'],
  ['categories', 'Catégories'],
]

export default function Admin() {
  const [onglet, setOnglet] = useState('synthese')
  const [synthese, setSynthese] = useState(null)
  const [categories, setCategories] = useState([])
  const [litiges, setLitiges] = useState([])
  const [offres, setOffres] = useState([])
  const [comptes, setComptes] = useState([])
  const [atraiter, setAtraiter] = useState([])
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [nouvelle, setNouvelle] = useState({ nom: '', description: '' })
  const [modale, setModale] = useState(null)
  const [texte, setTexte] = useState('')
  const [decision, setDecision] = useState('restitution')
  const [envoi, setEnvoi] = useState(false)

  function charger() {
    Promise.all([
      apiGet('/admin/synthese'),
      apiGet('/categories'),
      apiGet('/admin/litiges'),
      apiGet('/admin/offres'),
      apiGet('/admin/comptes'),
      apiGet('/admin/reservations-a-traiter'),
    ])
      .then(([s, c, l, o, u, t]) => {
        setSynthese(s)
        setCategories(c.categories)
        setLitiges(l.litiges)
        setOffres(o.offres)
        setComptes(u.comptes)
        setAtraiter(t.reservations)
      })
      .catch((err) => setErreur(err.message))
  }
  useEffect(charger, [])

  async function agir(fn, messageSucces) {
    if (envoi) return
    setErreur('')
    setSucces('')
    setEnvoi(true)
    try {
      await fn()
      if (messageSucces) setSucces(messageSucces)
      setModale(null)
      setTexte('')
      charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  const ajouterCategorie = (e) => {
    e.preventDefault()
    agir(async () => {
      await apiPost('/categories', nouvelle)
      setNouvelle({ nom: '', description: '' })
    }, 'Catégorie ajoutée.')
  }

  function ouvrir(type, cible) {
    setErreur('')
    setTexte('')
    setDecision('restitution')
    setModale({ type, cible })
  }

  function valider(e) {
    e.preventDefault()
    const { type, cible } = modale
    if (type === 'regler') agir(() => apiPost(`/admin/litiges/${cible.id}/regler`, { decision, motif: texte }), 'Litige réglé. Le règlement est définitif.')
    if (type === 'masquer') agir(() => apiPost(`/admin/offres/${cible.id}/masquer`, { motif: texte }), 'Offre masquée, demandes en attente annulées.')
    if (type === 'annuler') agir(() => apiPost(`/admin/reservations/${cible.id}/annuler`, { motif: texte }), 'Réservation annulée, crédits libérés.')
  }

  if (!synthese) return erreur ? <Alert tone="error">{erreur}</Alert> : <Spinner />
  const ouverts = litiges.filter((l) => l.statut === 'ouvert')

  return (
    <div className="space-y-5 fade-in">
      <header>
        <h1 className="text-2xl">Administration</h1>
        <p className="mt-1 text-sm text-ink-500">Comptes, catégories, modération des offres et règlement des litiges.</p>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 text-sm font-semibold">
        {ONGLETS.map(([cle, label]) => (
          <button key={cle} type="button" onClick={() => setOnglet(cle)} className={`whitespace-nowrap rounded-lg px-3 py-2 transition ${onglet === cle ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>
            {label}
            {cle === 'litiges' && ouverts.length > 0 && <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">{ouverts.length}</span>}
          </button>
        ))}
      </div>

      {succes && <Alert tone="success" onClose={() => setSucces('')}>{succes}</Alert>}
      {erreur && !modale && <Alert tone="error" onClose={() => setErreur('')}>{erreur}</Alert>}

      {onglet === 'synthese' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Comptes actifs" value={synthese.comptes_actifs} hint={`${synthese.comptes_desactives} désactivé(s)`} tone="brand" />
          <StatCard label="Offres publiées" value={synthese.offres_publiees} hint={`${synthese.offres_masquees} masquée(s)`} tone="accent" />
          <StatCard label="Séances acceptées" value={synthese.seances_acceptees} hint={`${synthese.seances_realisees} réalisée(s)`} tone="brand" />
          <StatCard label="Crédits transférés" value={synthese.credits_transferes} hint={`${synthese.credits_bloques} actuellement bloqués`} tone="amber" />
          <StatCard label="Litiges ouverts" value={synthese.litiges_ouverts} hint={`${synthese.litiges_regles} réglé(s)`} tone="ink" />
        </div>
      )}

      {onglet === 'litiges' && (
        <div className="space-y-4">
          {litiges.length === 0 && <EmptyState title="Aucun litige" description="Tout se passe bien sur le campus." />}
          {litiges.map((l) => (
            <article key={l.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge statut={l.statut} />
                    <span className="chip">{l.type === 'absence' ? 'Absence' : 'Désaccord'}</span>
                    {l.reservation && <span className="chip">{l.reservation.credits_bloques || l.reservation.cout_credits} crédit(s) en jeu</span>}
                  </div>
                  <h2 className="mt-2 text-base font-semibold">{l.reservation?.offre_titre}</h2>
                  {l.reservation && (
                    <p className="text-sm text-ink-500">
                      {formatDateHeure(l.reservation.debut)} · intervenant {l.reservation.intervenant_nom} · bénéficiaire {l.reservation.beneficiaire_nom}
                    </p>
                  )}
                  <ul className="mt-3 space-y-2 text-sm">
                    {l.elements.map((e) => (
                      <li key={e.id} className="rounded-xl bg-ink-50 px-3 py-2">
                        <span className="font-semibold">{e.auteur_nom}</span> <span className="text-xs text-ink-400">({e.type === 'absence' ? 'absence' : 'désaccord'}, {formatDateHeure(e.date)})</span>
                        <p className="text-ink-700">{e.texte}</p>
                      </li>
                    ))}
                  </ul>
                  {l.statut === 'regle' && (
                    <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      Décision : {l.decision === 'transfert' ? 'transfert intégral à l’intervenant' : 'restitution intégrale au bénéficiaire'}. {l.motif_decision}
                    </p>
                  )}
                </div>
                {l.statut === 'ouvert' && <button type="button" className="btn-primary btn-sm" onClick={() => ouvrir('regler', l)}>Régler</button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {onglet === 'offres' && (
        <section className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr><th className="px-4 py-3">Offre</th><th className="px-4 py-3">Intervenant</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {offres.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium text-ink-900">{o.titre}<p className="text-xs font-normal text-ink-400">{o.categorie} · {o.duree_heures} h</p></td>
                  <td className="px-4 py-3 text-ink-600">{o.intervenant_nom}</td>
                  <td className="px-4 py-3"><Badge statut={o.statut} />{o.masquee && <span className="ml-1"><Badge statut="masquee" /></span>}</td>
                  <td className="px-4 py-3 text-right">
                    {o.masquee ? (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => agir(() => apiPost(`/admin/offres/${o.id}/masquer`, { masquer: false }), 'Offre de nouveau visible.')}>Démasquer</button>
                    ) : (
                      <button type="button" className="btn-danger btn-sm" onClick={() => ouvrir('masquer', o)}>Masquer</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {onglet === 'comptes' && (
        <div className="space-y-4">
          {atraiter.length > 0 && (
            <section className="card border-amber-200 bg-amber-50/40 p-5">
              <h2 className="text-lg">Réservations acceptées à traiter (compte désactivé)</h2>
              <ul className="mt-3 divide-y divide-amber-100 text-sm">
                {atraiter.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{r.offre_titre} · {r.intervenant_nom} → {r.beneficiaire_nom} · {r.credits_bloques} bloqué(s)</span>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => ouvrir('annuler', r)}>Annuler et libérer</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr><th className="px-4 py-3">Compte</th><th className="px-4 py-3">Rôle</th><th className="px-4 py-3">Crédits</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {comptes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-ink-900">{c.prenom} {c.nom}<p className="text-xs font-normal text-ink-400">{c.email}</p></td>
                    <td className="px-4 py-3 text-ink-600">{c.role === 'admin' ? 'Administrateur' : 'Étudiant'}</td>
                    <td className="px-4 py-3 text-ink-600">{c.solde_credits} dispo · {c.credits_bloques} bloqué(s)</td>
                    <td className="px-4 py-3"><Badge statut={c.statut} /></td>
                    <td className="px-4 py-3 text-right">
                      {c.statut === 'actif' ? (
                        <button type="button" className="btn-danger btn-sm" onClick={() => agir(async () => { const r = await apiPost(`/admin/comptes/${c.id}/statut`, { statut: 'desactive' }); if (r.reservations_a_traiter) setSucces(`Compte désactivé. ${r.reservations_a_traiter} réservation(s) acceptée(s) à traiter.`) }, 'Compte désactivé.')}>Désactiver</button>
                      ) : (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => agir(() => apiPost(`/admin/comptes/${c.id}/statut`, { statut: 'actif' }), 'Compte réactivé.')}>Réactiver</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {onglet === 'categories' && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="card divide-y divide-ink-100">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{c.nom} <span className="chip ml-1">{c.offres} offre{c.offres > 1 ? 's' : ''}</span></p>
                  <p className="truncate text-xs text-ink-500">{c.description || 'Sans description'}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { const n = window.prompt('Nouveau nom de la catégorie :', c.nom); if (n) agir(() => apiPut(`/categories/${c.id}`, { nom: n }), 'Catégorie renommée.') }}>Renommer</button>
                  <button type="button" className="btn-danger btn-sm" onClick={() => agir(() => apiDelete(`/categories/${c.id}`), 'Catégorie supprimée.')}>Supprimer</button>
                </div>
              </div>
            ))}
          </section>
          <form onSubmit={ajouterCategorie} className="card h-fit space-y-3 p-5">
            <h2 className="text-lg">Nouvelle catégorie</h2>
            <input className="input" placeholder="Nom" value={nouvelle.nom} onChange={(e) => setNouvelle({ ...nouvelle, nom: e.target.value })} required aria-label="Nom" />
            <input className="input" placeholder="Description" value={nouvelle.description} onChange={(e) => setNouvelle({ ...nouvelle, description: e.target.value })} aria-label="Description" />
            <button type="submit" className="btn-primary w-full" disabled={envoi}>Ajouter</button>
          </form>
        </div>
      )}

      <Modal
        open={Boolean(modale)}
        title={modale?.type === 'regler' ? 'Régler le litige' : modale?.type === 'masquer' ? 'Masquer l’offre' : 'Annuler la réservation'}
        description={modale?.cible?.reservation?.offre_titre || modale?.cible?.titre || modale?.cible?.offre_titre}
        onClose={() => setModale(null)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setModale(null)}>Fermer</button>
            <button type="submit" form="form-admin" disabled={envoi} className="btn-primary">Valider</button>
          </>
        }
      >
        {erreur && <div className="mb-3"><Alert tone="error">{erreur}</Alert></div>}
        <form id="form-admin" onSubmit={valider} className="space-y-3">
          {modale?.type === 'regler' && (
            <div>
              <span className="label">Décision (définitive, sans règlement partiel)</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {[['restitution', 'Restitution intégrale', 'au bénéficiaire, séance annulée'], ['transfert', 'Transfert intégral', "à l'intervenant, séance réalisée"]].map(([v, t, d]) => (
                  <button key={v} type="button" onClick={() => setDecision(v)} className={`rounded-xl border p-3 text-left text-sm ${decision === v ? 'border-brand-500 bg-brand-50' : 'border-ink-200'}`}>
                    <span className="block font-semibold">{t}</span>
                    <span className="text-xs text-ink-500">{d}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="motif">Motif {modale?.type === 'regler' ? 'de la décision (obligatoire)' : ''}</label>
            <textarea id="motif" rows={4} className="input" value={texte} onChange={(e) => setTexte(e.target.value)} required minLength={modale?.type === 'regler' ? 10 : 5} />
          </div>
        </form>
      </Modal>
    </div>
  )
}
