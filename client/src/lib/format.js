export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatHeure(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateHeure(iso) {
  if (!iso) return ''
  return `${formatDate(iso)} · ${formatHeure(iso)}`
}

export function formatRelatif(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return "à l’instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.round(heures / 24)
  return `il y a ${jours} j`
}

export const STATUTS = {
  en_attente: { label: 'En attente', classes: 'bg-amber-100 text-amber-800' },
  confirmee: { label: 'Confirmée', classes: 'bg-emerald-100 text-emerald-800' },
  annulee: { label: 'Annulée', classes: 'bg-ink-100 text-ink-600' },
  refusee: { label: 'Refusée', classes: 'bg-rose-100 text-rose-700' },
  litige: { label: 'Litige', classes: 'bg-rose-100 text-rose-700' },
  litige_resolu: { label: 'Litige résolu', classes: 'bg-ink-100 text-ink-700' },
  publiee: { label: 'Publiée', classes: 'bg-emerald-100 text-emerald-800' },
  archivee: { label: 'Archivée', classes: 'bg-ink-100 text-ink-600' },
  suspendue: { label: 'Suspendue', classes: 'bg-amber-100 text-amber-800' },
  libre: { label: 'Libre', classes: 'bg-emerald-100 text-emerald-800' },
  demande: { label: 'Demande en cours', classes: 'bg-amber-100 text-amber-800' },
  reserve: { label: 'Réservé', classes: 'bg-brand-100 text-brand-800' },
}

export const NIVEAUX = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
}

export const MODES = {
  presentiel: 'Présentiel',
  en_ligne: 'En ligne',
}

export function toInputDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
