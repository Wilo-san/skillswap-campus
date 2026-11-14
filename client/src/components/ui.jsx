import { STATUTS } from '../lib/format.js'

export function Badge({ statut, children }) {
  const conf = STATUTS[statut] || { label: statut, classes: 'bg-ink-100 text-ink-600' }
  return <span className={`badge ${conf.classes}`}>{children || conf.label}</span>
}

export function Spinner({ label = 'Chargement...' }) {
  return (
    <div className="flex items-center gap-3 py-16 text-sm text-ink-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
      {label}
    </div>
  )
}

export function Alert({ tone = 'error', children, onClose }) {
  if (!children) return null
  const tones = {
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-brand-200 bg-brand-50 text-brand-800',
  }
  return (
    <div className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <span>{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Fermer
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-xl text-brand-600">✦</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-500">{description}</p>}
      {action}
    </div>
  )
}

export function Modal({ open, title, description, onClose, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="fade-in w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-soft sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {description && <p className="mt-1 text-xs text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg leading-none text-ink-400 hover:bg-ink-50 hover:text-ink-700"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function StatCard({ label, value, hint, tone = 'brand' }) {
  const tones = {
    brand: 'from-brand-500/10 to-brand-500/0 text-brand-700',
    accent: 'from-emerald-500/10 to-emerald-500/0 text-emerald-700',
    amber: 'from-amber-500/10 to-amber-500/0 text-amber-700',
    ink: 'from-ink-500/10 to-ink-500/0 text-ink-700',
  }
  return (
    <div className={`card bg-gradient-to-br ${tones[tone]} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 font-display text-2xl text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}
