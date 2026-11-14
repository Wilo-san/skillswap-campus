import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Spinner, StatCard } from '../components/ui.jsx'
import { apiGet } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { formatDateHeure, formatRelatif, MODES } from '../lib/format.js'

export default function Dashboard() {
  const { user, refresh } = useAuth()
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    apiGet('/dashboard')
      .then(setData)
      .catch((err) => setErreur(err.message))
    refresh()
  }, [])

  if (erreur) return <Alert tone="error">{erreur}</Alert>
  if (!data) return <Spinner />

  const { stats, prochaines, activite } = data
  const prenom = user?.prenom || ''

  return (
    <div className="space-y-6 fade-in">
      <section className="card overflow-hidden bg-gradient-to-br from-ink-900 to-brand-800 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-200">Bonjour {prenom}</p>
            <h1 className="mt-2 max-w-xl font-display text-2xl leading-snug sm:text-3xl">
              {stats.demandes_recues > 0
                ? `${stats.demandes_recues} demande${stats.demandes_recues > 1 ? 's' : ''} attend${stats.demandes_recues > 1 ? 'ent' : ''} ta confirmation.`
                : 'Que veux-tu apprendre aujourd’hui ?'}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-ink-200">
              {stats.sessions_donnees + stats.sessions_recues > 0
                ? `Tu as déjà participé à ${stats.sessions_donnees + stats.sessions_recues} session${stats.sessions_donnees + stats.sessions_recues > 1 ? 's' : ''} sur le campus. Continue sur ta lancée.`
                : 'Publie ta première offre ou réserve un créneau pour démarrer tes échanges.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/marche" className="btn bg-white text-ink-900 hover:bg-ink-100">
              Explorer le marché
            </Link>
            <Link to="/mes-offres" className="btn border border-white/30 text-white hover:bg-white/10">
              Publier une offre
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Solde" value={`${data.solde} crédits`} hint="Utilisables pour réserver" tone="brand" />
        <StatCard label="Offres publiées" value={stats.offres_publiees} hint="Compétences que tu proposes" tone="accent" />
        <StatCard label="Demandes reçues" value={stats.demandes_recues} hint="À confirmer par toi" tone="amber" />
        <StatCard label="Sessions données" value={stats.sessions_donnees} hint={`${stats.sessions_recues} recues`} tone="ink" />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Prochaines sessions</h2>
            <Link to="/reservations" className="text-xs font-semibold text-brand-600 hover:underline">
              Tout voir
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {prochaines.length === 0 && (
              <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
                Aucune session confirmée pour le moment. Réserve un créneau depuis le marché des compétences.
              </p>
            )}
            {prochaines.map((resa) => (
              <div key={resa.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{resa.offre_titre}</p>
                  <p className="text-xs text-ink-500">
                    {formatDateHeure(resa.debut)} · {resa.lieu}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="chip">{resa.role === 'intervenant' ? 'Tu enseignes' : 'Tu apprends'}</span>
                  <span className="chip">avec {resa.role === 'intervenant' ? resa.beneficiaire_nom : resa.intervenant_nom}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">Activité récente</h2>
          <div className="mt-4 space-y-4">
            {activite.length === 0 && <p className="text-sm text-ink-500">Rien pour l’instant.</p>}
            {activite.map((resa) => (
              <div key={resa.id} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">{resa.offre_titre}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge statut={resa.statut} />
                    <span className="text-xs text-ink-400">{formatRelatif(resa.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Comment fonctionne l’échange</h2>
            <p className="mt-1 text-sm text-ink-500">Trois étapes, un solde toujours lisible.</p>
          </div>
          <Link to="/credits" className="btn-ghost btn-sm">
            Voir mes crédits
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { titre: '1. Publie ou choisis', texte: 'Une compétence que tu maîtrises, ou un créneau qui t’intéresse.' },
            { titre: '2. Confirmez ensemble', texte: 'Toi et l’intervenant validez la session. Les crédits sont bloqués.' },
            { titre: '3. Echangez', texte: 'La session a lieu, les crédits passent à l’intervenant. Puis à ton tour d’apprendre.' },
          ].map((etape) => (
            <div key={etape.titre} className="rounded-xl bg-ink-50 p-4">
              <p className="text-sm font-semibold text-ink-900">{etape.titre}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{etape.texte}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
