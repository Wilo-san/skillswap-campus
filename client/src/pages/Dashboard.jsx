import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Spinner, StatCard } from '../components/ui.jsx'
import { apiGet } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { formatDateHeure, formatHeure } from '../lib/format.js'

export default function Dashboard() {
  const { user, refresh } = useAuth()
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    apiGet('/dashboard').then(setData).catch((err) => setErreur(err.message))
    refresh()
  }, [])

  if (erreur) return <Alert tone="error">{erreur}</Alert>
  if (!data) return <Spinner />

  const { stats, prochaines, recentes } = data
  const aTraiter = stats.demandes_recues + stats.a_confirmer

  return (
    <div className="space-y-6 fade-in">
      <section className="card overflow-hidden bg-gradient-to-br from-ink-900 to-brand-800 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-200">Bonjour {user?.prenom}</p>
            <h1 className="mt-2 max-w-xl font-display text-2xl leading-snug sm:text-3xl">
              {aTraiter > 0
                ? `${aTraiter} action${aTraiter > 1 ? 's' : ''} t’attend${aTraiter > 1 ? 'ent' : ''}.`
                : 'Que veux-tu apprendre aujourd’hui ?'}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-ink-200">
              {stats.demandes_recues > 0 && `${stats.demandes_recues} demande(s) à accepter ou refuser. `}
              {stats.a_confirmer > 0 && `${stats.a_confirmer} séance(s) à confirmer. `}
              {aTraiter === 0 && 'Un crédit équivaut à une heure : anime une séance pour en gagner.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/marche" className="btn bg-white text-ink-900 hover:bg-ink-100">Explorer le marché</Link>
            <Link to="/mes-offres" className="btn border border-white/30 text-white hover:bg-white/10">Mes offres</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Disponible" value={`${data.solde} crédit${data.solde > 1 ? 's' : ''}`} hint={`${data.bloque} bloqué${data.bloque > 1 ? 's' : ''}`} tone="brand" />
        <StatCard label="Demandes reçues" value={stats.demandes_recues} hint="À accepter ou refuser" tone="amber" />
        <StatCard label="Séances animées" value={stats.sessions_donnees} hint={`${stats.sessions_recues} suivies`} tone="accent" />
        <StatCard label="Ma note" value={data.note_moyenne != null ? `★ ${data.note_moyenne}` : '—'} hint={`${data.nb_evaluations} évaluation${data.nb_evaluations > 1 ? 's' : ''}`} tone="ink" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Prochaines séances</h2>
            <Link to="/planning" className="link text-sm">Planning</Link>
          </div>
          {prochaines.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">Aucune séance acceptée pour le moment.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {prochaines.map((s) => (
                <li key={s.id} className="py-3">
                  <p className="text-sm font-semibold text-ink-900">{s.offre_titre}</p>
                  <p className="text-xs text-ink-500">{formatDateHeure(s.debut)} → {formatHeure(s.fin)} · avec {s.autre_nom}</p>
                  <span className="mt-1 inline-block chip">{s.role === 'intervenant' ? 'Tu animes' : 'Tu apprends'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Activité récente</h2>
            <Link to="/reservations" className="link text-sm">Tout voir</Link>
          </div>
          {recentes.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">Rien pour l’instant.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {recentes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{r.offre_titre}</p>
                    <p className="text-xs text-ink-500">{r.role === 'intervenant' ? 'avec' : 'chez'} {r.autre_nom}</p>
                  </div>
                  <Badge statut={r.statut} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
