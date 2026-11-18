import type { BookingStatus, Level, Mode } from './types';

const tz = 'Africa/Casablanca';
export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(d));
export const fmtTime = (d: string | Date) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(d));
export const fmtDateTime = (d: string | Date) => `${fmtDate(d)} · ${fmtTime(d)}`;
export const fmtRange = (s: string | Date, e: string | Date) => `${fmtDate(s)} · ${fmtTime(s)} à ${fmtTime(e)}`;
export const fmtFull = (d: string | Date) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(d));

export const dayKey = (d: string | Date) =>
  new Intl.DateTimeFormat('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(new Date(d));
export const fmtDayLong = (d: string | Date) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date(d));

export const levelLabel: Record<Level, string> = { BEGINNER: 'Débutant', INTERMEDIATE: 'Intermédiaire', ADVANCED: 'Avancé' };
export const modeLabel: Record<Mode, string> = { ONSITE: 'Présentiel', REMOTE: 'À distance' };
export const statusLabel: Record<BookingStatus, string> = {
  PENDING: 'En attente', REFUSED: 'Refusée', ACCEPTED: 'Acceptée', CANCELLED: 'Annulée', COMPLETED: 'Réalisée', DISPUTED: 'En litige',
};
export const statusTone: Record<BookingStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  REFUSED: 'bg-rose-50 text-rose-700 ring-rose-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200',
  COMPLETED: 'bg-brand-50 text-brand-700 ring-brand-200',
  DISPUTED: 'bg-orange-50 text-orange-700 ring-orange-200',
};
export const ledgerLabel = {
  WELCOME_BONUS: 'Crédits de bienvenue', BLOCK: 'Blocage', RELEASE: 'Libération',
  TRANSFER_OUT: 'Transfert envoyé', TRANSFER_IN: 'Crédits reçus', REFUND: 'Restitution',
} as const;
export const disputeReasonLabel = {
  ABSENCE: 'Absence', DISAGREEMENT: 'Désaccord', MISSING_CONFIRMATION: 'Confirmation manquante', OTHER: 'Autre',
} as const;
export const initials = (p: { firstName: string; lastName: string }) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n > 1 ? many : one}`;
