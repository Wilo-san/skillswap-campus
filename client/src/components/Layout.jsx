import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  { to: '/dashboard', label: 'Tableau de bord', icone: '◧' },
  { to: '/marche', label: 'Marché des compétences', icone: '◎' },
  { to: '/mes-offres', label: 'Mes offres', icone: '✎' },
  { to: '/reservations', label: 'Réservations', icone: '⇄' },
  { to: '/credits', label: 'Crédits', icone: '¤' },
  { to: '/profil', label: 'Mon profil', icone: '☺' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const nav = user?.role === 'admin' ? [...NAV, { to: '/admin', label: 'Administration', icone: '⚙' }] : NAV
  const initiales = `${user?.prenom?.[0] || ''}${user?.nom?.[0] || ''}`.toUpperCase() || 'ET'

  return (
    <div className="min-h-screen bg-ink-50 lg:flex">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-ink-100 bg-white px-5 py-6 lg:flex">
        <Link to="/dashboard" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-display text-lg text-white shadow-soft">
            S
          </span>
          <span>
            <span className="block font-display text-base leading-tight text-ink-900">SkillSwap</span>
            <span className="block text-xs font-semibold uppercase tracking-widest text-brand-600">Campus</span>
          </span>
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                }`
              }
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-xs text-ink-600">
                {item.icone}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-brand-200">Solde disponible</p>
          <p className="mt-1 font-display text-2xl">
            {user?.solde_credits ?? 0} <span className="text-sm font-normal text-brand-200">crédits</span>
          </p>
          <Link to="/credits" className="mt-3 inline-flex text-xs font-semibold text-white/90 underline-offset-4 hover:underline">
            Voir l’historique
          </Link>
        </div>

        <button
          onClick={logout}
          className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-800"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-xs">↪</span>
          Se déconnecter
        </button>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-0">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-display text-white">S</span>
              <span className="font-display text-sm text-ink-900">SkillSwap Campus</span>
            </div>
            <p className="hidden text-sm text-ink-500 lg:block">
              {nav.find((item) => item.to === location.pathname)?.label || 'SkillSwap Campus'}
            </p>
            <div className="flex items-center gap-2">
              <span className="badge bg-brand-50 text-brand-700">{user?.solde_credits ?? 0} crédits</span>
              <Link
                to="/profil"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white"
                title="Mon profil"
              >
                {initiales}
              </Link>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isActive ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="border-t border-ink-100 px-4 py-4 text-center text-xs text-ink-400 lg:px-8">
          SkillSwap Campus · échange de compétences entre étudiants · projet Base44
        </footer>
      </div>
    </div>
  )
}
