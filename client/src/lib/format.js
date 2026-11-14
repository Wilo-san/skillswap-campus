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
  acceptee: { label: 'Acceptée', classes: 'bg-emerald-100 text-emerald-800' },
  refusee: { label: 'Refusée', classes: 'bg-rose-100 text-rose-700' },
  annulee: { label: 'Annulée', classes: 'bg-ink-100 text-ink-600' },
  realisee: { label: 'Réalisée', classes: 'bg-brand-100 text-brand-800' },
  en_litige: { label: 'En litige', classes: 'bg-rose-100 text-rose-700' },
  brouillon: { label: 'Brouillon', classes: 'bg-ink-100 text-ink-600' },
  publiee: { label: 'Publiée', classes: 'bg-emerald-100 text-emerald-800' },
  archivee: { label: 'Archivée', classes: 'bg-ink-100 text-ink-600' },
  masquee: { label: 'Masquée', classes: 'bg-rose-100 text-rose-700' },
  libre: { label: 'Libre', classes: 'bg-emerald-100 text-emerald-800' },
  reserve: { label: 'Réservé', classes: 'bg-brand-100 text-brand-800' },
  ouvert: { label: 'Ouvert', classes: 'bg-rose-100 text-rose-700' },
  regle: { label: 'Réglé', classes: 'bg-ink-100 text-ink-700' },
  actif: { label: 'Actif', classes: 'bg-emerald-100 text-emerald-800' },
  desactive: { label: 'Désactivé', classes: 'bg-rose-100 text-rose-700' },
}

export const NIVEAUX = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
}

export const MODES = {
  presentiel: 'Présentiel',
  distance: 'À distance',
}

export const TYPES_MOUVEMENT = {
  bienvenue: { label: 'Bienvenue', signe: '+', classes: 'text-emerald-700' },
  blocage: { label: 'Blocage', signe: '−', classes: 'text-amber-700' },
  liberation: { label: 'Libération', signe: '+', classes: 'text-emerald-700' },
  transfert_emis: { label: 'Transfert émis', signe: '−', classes: 'text-rose-700' },
  transfert_recu: { label: 'Transfert reçu', signe: '+', classes: 'text-emerald-700' },
}

export function etoiles(note) {
  if (note == null) return '—'
  return `${note.toFixed(1)} / 5`
}

export function formatCredits(n) {
  return `${n} crédit${Math.abs(n) > 1 ? 's' : ''}`
}
