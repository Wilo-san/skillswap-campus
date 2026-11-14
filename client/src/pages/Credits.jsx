import { useEffect, useState } from 'react'
import { Alert, Spinner, StatCard } from '../components/ui.jsx'
import { apiGet } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { formatDateHeure } from '../lib/format.js'

const TYPES = {
  bonus: { label: 'Bonus', classes: 'text-emerald-700' },
  credit: { label: 'Gain', classes: 'text-emerald-700' },
  debit: { label: 'Depense', classes: 'text-rose-600' },
  remboursement: { label: 'Remboursement', classes: 'text-brand-700' },
}

export default function Credits() {
  const { refresh } = useAuth()
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    apiGet('/credits')
      .then(setData)
      .catch((err) => setErreur(err.message))
    refresh()
  }, [])

  if (erreur) return <Alert tone="error">{erreur}</Alert>
  if (!data) return <Spinner />

  const gains = data.mouvements.filter((m) => m.quantite > 0).reduce((t, m) => t + m.quantite, 0)
  const depenses = data.mouvements.filter((m) => m.quantite < 0).reduce((t, m) => t + Math.abs(m.quantite), 0)

  return (
    <div className="space-y-5 fade-in">
      <header>
        <h1 className="text-2xl">Mes crédits</h1>
        <p className="mt-1 text-sm text-ink-500">
          Chaque session donnée rapporte des crédits, chaque session reçue en coûte.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Solde actuel" value={`${data.solde} cr.`} hint="Disponible immédiatement" tone="brand" />
        <StatCard label="Total gagné" value={`${gains} cr.`} hint="Sessions données et bonus" tone="accent" />
        <StatCard label="Total dépensé" value={`${depenses} cr.`} hint="Sessions reçues" tone="amber" />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold">Historique des mouvements</h2>
        </div>
        <ul className="divide-y divide-ink-100">
          {data.mouvements.length === 0 && (
            <li className="px-5 py-6 text-sm text-ink-500">Aucun mouvement pour le moment.</li>
          )}
          {data.mouvements.map((m) => {
            const type = TYPES[m.type] || { label: m.type, classes: 'text-ink-600' }
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">{m.description}</p>
                  <p className="text-xs text-ink-400">
                    {type.label} · {formatDateHeure(m.date)}
                  </p>
                </div>
                <span className={`font-display text-base ${m.quantite >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {m.quantite >= 0 ? '+' : ''}
                  {m.quantite} cr.
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Comment gagner des crédits</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-600">
          <li>· Publie une offre et donne une session : tu reçois le coût en crédits de l’offre.</li>
          <li>· Chaque nouvel inscrit démarre avec 5 crédits de bienvenue.</li>
          <li>· Une annulation ou un litige résolu par remboursement te rend tes crédits.</li>
        </ul>
      </section>
    </div>
  )
}
