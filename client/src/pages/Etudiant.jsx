import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Spinner } from '../components/ui.jsx'
import { apiGet } from '../lib/api.js'
import { formatRelatif } from '../lib/format.js'

export function Etoiles({ note }) {
  const pleines = Math.round(note || 0)
  return (
    <span className="text-amber-500" aria-label={`${note} sur 5`}>
      {'★'.repeat(pleines)}
      <span className="text-ink-200">{'★'.repeat(5 - pleines)}</span>
    </span>
  )
}

export default function Etudiant() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    apiGet(`/auth/profils/${id}`).then(setData).catch((e) => setErreur(e.message))
  }, [id])

  if (erreur) return <Alert tone="error">{erreur}</Alert>
  if (!data) return <Spinner />
  const { profil, evaluations } = data

  return (
    <div className="space-y-5 fade-in">
      <Link to="/marche" className="link text-sm">← Retour</Link>
      <section className="card p-6">
        <h1 className="text-2xl">{profil.nom_complet}</h1>
        <p className="mt-1 text-sm text-ink-500">{profil.filiere || 'Filière non renseignée'}</p>
        <div className="mt-3 flex items-center gap-2">
          {profil.note_moyenne != null ? (
            <>
              <Etoiles note={profil.note_moyenne} />
              <span className="text-sm font-semibold">{profil.note_moyenne} / 5</span>
              <span className="text-xs text-ink-500">({profil.nb_evaluations} évaluation{profil.nb_evaluations > 1 ? 's' : ''})</span>
            </>
          ) : (
            <span className="text-sm text-ink-500">Pas encore évalué</span>
          )}
        </div>
        {profil.bio && <p className="mt-4 text-sm text-ink-600">{profil.bio}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="label">Compétences proposées</p>
            <div className="flex flex-wrap gap-1.5">{profil.competences_proposees.length ? profil.competences_proposees.map((c) => <span key={c} className="chip bg-brand-50 text-brand-700">{c}</span>) : <span className="text-sm text-ink-400">Aucune</span>}</div>
          </div>
          <div>
            <p className="label">Compétences recherchées</p>
            <div className="flex flex-wrap gap-1.5">{profil.competences_recherchees.length ? profil.competences_recherchees.map((c) => <span key={c} className="chip bg-emerald-50 text-emerald-700">{c}</span>) : <span className="text-sm text-ink-400">Aucune</span>}</div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg">Évaluations reçues</h2>
        {evaluations.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">Aucune évaluation pour le moment.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-100">
            {evaluations.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{e.auteur_nom}</p>
                  <p className="text-xs text-ink-400">{formatRelatif(e.date)}</p>
                </div>
                <Etoiles note={e.note} />
                {e.commentaire && <p className="mt-1 text-sm text-ink-600">{e.commentaire}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
