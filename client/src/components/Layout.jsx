import { NavLink, Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { apiGet, apiPost } from '../lib/api.js'
import { formatRelatif } from '../lib/format.js'

function Cloche() {
  const [ouvert, setOuvert] = useState(false)
  const [data, setData] = useState({ notifications: [], non_lues: 0 })
  const ref = useRef(null)
  const location = useLocation()

  useEffect(() => {
    apiGet('/notifications').then(setData).catch(() => {})
  }, [location.pathname, ouvert])

  useEffect(() => {
    const fermer = (e) => ref.current && !ref.current.contains(e.target) && setOuvert(false)
    document.addEventListener('mousedown', fermer)
    return () => document.removeEventListener('mousedown', fermer)
  }, [])

  async function toutLire() {
    await apiPost('/notifications/lues', {})
    setData((d) => ({ ...d, non_lues: 0, notifications: d.notifications.map((n) => ({ ...n, lue: true })) }))
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOuvert((o) => !o)} className="relative flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-sm text-ink-700 hover:bg-ink-200" aria-label="Notifications">
        🔔
        {data.non_lues > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{data.non_lues}</span>
        )}
      </button>
      {ouvert && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {data.non_lues > 0 && (
              <button type="button" onClick={toutLire} className="text-xs font-semibold text-brand-600">Tout marquer comme lu</button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
            {data.notifications.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-500">Aucune notification.</li>}
            {data.notifications.map((n) => (
              <li key={n.id} className={`px-4 py-3 text-sm ${n.lue ? 'text-ink-500' : 'bg-brand-50/50 text-ink-800'}`}>
                {n.lien ? <Link to={n.lien} onClick={() => setOuvert(false)}>{n.message}</Link> : n.message}
                <p className="mt-0.5 text-xs text-ink-400">{formatRelatif(n.date)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const NAV = [
  { to: '/dashboard', label: 'Tableau de bord', icone: '◧' },
  { to: '/marche', label: 'Marché des compétences', icone: '◎' },
  { to: '/mes-offres', label: 'Mes offres', icone: '✎' },
  { to: '/reservations', label: 'Réservations', icone: '⇄' },
  { to: '/planning', label: 'Planning', icone: '▦' },
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
          <p className="mt-1 text-xs text-brand-200">{user?.credits_bloques ?? 0} bloqué{(user?.credits_bloques ?? 0) > 1 ? 's' : ''}</p>
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
              <span className="badge bg-brand-50 text-brand-700">
                {user?.solde_credits ?? 0} crédits{(user?.credits_bloques ?? 0) > 0 ? ` · ${user.credits_bloques} bloqués` : ''}
              </span>
              <Cloche />
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
          SkillSwap Campus · banque de temps entre étudiants · EST Béni Mellal, DUT GI S3
        </footer>
      </div>
    </div>
  )
}
