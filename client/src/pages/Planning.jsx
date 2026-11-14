import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, EmptyState, Spinner } from '../components/ui.jsx'
import { apiGet } from '../lib/api.js'
import { formatDate, formatHeure, MODES } from '../lib/format.js'

export default function Planning() {
  const [seances, setSeances] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    apiGet('/planning').then((d) => setSeances(d.seances)).catch((e) => setErreur(e.message))
  }, [])

  if (erreur) return <Alert tone="error">{erreur}</Alert>
  if (!seances) return <Spinner />

  const maintenant = Date.now()
  const aVenir = seances.filter((s) => new Date(s.fin).getTime() >= maintenant)
  const passees = seances.filter((s) => new Date(s.fin).getTime() < maintenant).reverse()

  // Regroupement par jour
  const parJour = aVenir.reduce((acc, s) => {
    const cle = s.debut.slice(0, 10)
    ;(acc[cle] ||= []).push(s)
    return acc
  }, {})

  return (
    <div className="space-y-6 fade-in">
      <header>
        <h1 className="text-2xl">Mon planning</h1>
        <p className="mt-1 text-sm text-ink-500">Tes séances acceptées, en tant qu’intervenant ou bénéficiaire.</p>
      </header>

      {aVenir.length === 0 ? (
        <EmptyState
          title="Aucune séance à venir"
          description="Dès qu’une demande est acceptée, la séance apparaît ici."
          action={<Link to="/marche" className="btn-primary btn-sm">Explorer le marché</Link>}
        />
      ) : (
        <div className="space-y-5">
          {Object.entries(parJour).map(([jour, liste]) => (
            <section key={jour}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{formatDate(jour + 'T12:00:00')}</h2>
              <div className="space-y-3">
                {liste.map((s) => <Ligne key={s.id} s={s} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {passees.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Séances passées</h2>
          <div className="space-y-3">{passees.map((s) => <Ligne key={s.id} s={s} />)}</div>
        </section>
      )}
    </div>
  )
}

function Ligne({ s }) {
  const intervenant = s.mon_role === 'intervenant'
  return (
    <article className="card flex flex-wrap items-center gap-4 p-4">
      <div className="w-24 shrink-0 text-center">
        <p className="font-display text-lg text-ink-900">{formatHeure(s.debut)}</p>
        <p className="text-xs text-ink-500">→ {formatHeure(s.fin)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge statut={s.statut} />
          <span className="chip">{intervenant ? 'Tu animes' : 'Tu apprends'}</span>
          <span className="chip">{MODES[s.mode] || s.mode}</span>
        </div>
        <p className="mt-1.5 font-semibold text-ink-900">{s.offre_titre}</p>
        <p className="text-sm text-ink-500">
          Avec {intervenant ? s.beneficiaire_nom : s.intervenant_nom}
          {s.lieu && <> · {/^https?:/.test(s.lieu) ? <a href={s.lieu} target="_blank" rel="noreferrer" className="link">Lien de réunion</a> : s.lieu}</>}
        </p>
      </div>
      <Link to="/reservations" className="btn-ghost btn-sm">Gérer</Link>
    </article>
  )
}
