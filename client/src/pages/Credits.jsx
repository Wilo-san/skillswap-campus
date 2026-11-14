import { useEffect, useState } from 'react'
import { Alert, EmptyState, Spinner, StatCard } from '../components/ui.jsx'
import { apiGet } from '../lib/api.js'
import { formatDateHeure, TYPES_MOUVEMENT } from '../lib/format.js'

export default function Credits() {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    apiGet('/credits').then(setData).catch((e) => setErreur(e.message))
  }, [])

  if (erreur) return <Alert tone="error">{erreur}</Alert>
  if (!data) return <Spinner />

  return (
    <div className="space-y-6 fade-in">
      <header>
        <h1 className="text-2xl">Mes crédits</h1>
        <p className="mt-1 text-sm text-ink-500">Un crédit correspond à une heure. Animer une séance en rapporte, en suivre une en coûte.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Disponible" value={`${data.disponible} crédit${data.disponible > 1 ? 's' : ''}`} hint="Utilisable pour une nouvelle séance" tone="brand" />
        <StatCard label="Bloqué" value={`${data.bloque} crédit${data.bloque > 1 ? 's' : ''}`} hint="Réservé aux séances acceptées" tone="amber" />
        <StatCard label="Total" value={`${data.disponible + data.bloque}`} hint="Disponible + bloqué" tone="ink" />
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-lg">Historique des mouvements</h2>
        </div>
        {data.mouvements.length === 0 ? (
          <EmptyState title="Aucun mouvement" description="Tes crédits apparaîtront ici." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Séance concernée</th>
                  <th className="px-5 py-3 text-right">Quantité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.mouvements.map((m) => {
                  const t = TYPES_MOUVEMENT[m.type] || { label: m.type, signe: '', classes: '' }
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-ink-500">{formatDateHeure(m.date)}</td>
                      <td className="px-5 py-3"><span className={`font-semibold ${t.classes}`}>{t.label}</span></td>
                      <td className="px-5 py-3 text-ink-600">{m.seance || m.description}</td>
                      <td className={`whitespace-nowrap px-5 py-3 text-right font-semibold ${t.classes}`}>{t.signe}{m.quantite}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
