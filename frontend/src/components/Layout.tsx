import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, Compass, Gavel, LayoutDashboard, LogOut, Menu, Package, Repeat2, Send, Shapes, ShieldCheck, Tag, Users, Wallet, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { Notif } from '../lib/types';
import { fmtDateTime, fullName } from '../lib/format';
import { Avatar } from './ui';

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm"><Repeat2 className="h-5 w-5" /></span>
      <span className={clsx('font-display text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-ink-900')}>
        SkillSwap<span className="text-brand-500"> Campus</span>
      </span>
    </span>
  );
}

const studentNav = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/catalog', label: 'Catalogue', icon: Compass },
  { to: '/offers', label: 'Mes offres', icon: Package },
  { to: '/requests', label: 'Demandes reçues', icon: Users },
  { to: '/bookings', label: 'Mes demandes', icon: Send },
  { to: '/planning', label: 'Planning', icon: CalendarDays },
  { to: '/wallet', label: 'Crédits', icon: Wallet },
  { to: '/disputes', label: 'Signalements', icon: Gavel },
];
const adminNav = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Comptes', icon: Users },
  { to: '/admin/categories', label: 'Catégories', icon: Shapes },
  { to: '/admin/offers', label: 'Modération', icon: Tag },
  { to: '/admin/disputes', label: 'Litiges', icon: Gavel },
];

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  const load = async () => {
    try {
      const r = await api.get<{ notifications: Notif[]; unread: number }>('/notifications');
      setItems(r.notifications);
      setUnread(r.unread);
    } catch { /* silencieux */ }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openItem = async (n: Notif) => {
    if (!n.read) { await api.post(`/notifications/${n.id}/read`); load(); }
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(!open); if (!open) load(); }} className="relative rounded-xl p-2 text-ink-700 hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} non lues` : ''}`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-pop">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-bold">Notifications</span>
            {unread > 0 && <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={async () => { await api.post('/notifications/read-all'); load(); }}>Tout marquer comme lu</button>}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-500">Aucune notification pour le moment.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={clsx('block w-full px-4 py-3 text-left transition hover:bg-slate-50', !n.read && 'bg-brand-50/50')}>
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                      <p className="text-xs text-ink-700">{n.message}</p>
                      <p className="mt-1 text-[11px] text-ink-500">{fmtDateTime(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ admin }: { admin?: boolean }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const nav = admin ? adminNav : studentNav;
  const isAdmin = user?.role === 'ADMIN';

  const links = (
    <nav className="flex flex-col gap-1" aria-label="Navigation principale">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setMenu(false)}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
          <Icon className="h-[18px] w-[18px]" />{label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_1fr]">
      {/* Barre latérale (ordinateur) */}
      <aside className="hidden bg-ink-900 p-4 lg:flex lg:flex-col lg:justify-between lg:sticky lg:top-0 lg:h-screen">
        <div>
          <Link to={admin ? '/admin' : '/'} className="mb-6 block px-2 pt-2"><Logo light /></Link>
          {admin && <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-300"><ShieldCheck className="h-4 w-4" />Espace administrateur</div>}
          {links}
        </div>
        <div className="space-y-2">
          {isAdmin && (
            <Link to={admin ? '/' : '/admin'} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-amber-300 hover:bg-white/10">
              <ShieldCheck className="h-[18px] w-[18px]" />{admin ? 'Espace étudiant' : 'Espace administrateur'}
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-xl p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
          <div className="lg:hidden"><Logo /></div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            {!admin && user && (
              <Link to="/wallet" className="hidden items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 sm:inline-flex" title="Mon portefeuille">
                <Wallet className="h-4 w-4" />{user.availableCredits} <span className="font-normal text-brand-600/80">dispo.</span>
                {user.blockedCredits > 0 && <span className="text-amber-600">· {user.blockedCredits} bloqué{user.blockedCredits > 1 ? 's' : ''}</span>}
              </Link>
            )}
            <NotificationBell />
            {user && (
              <div className="flex items-center gap-1">
                <Link to="/profile" className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100" aria-label="Mon profil">
                  <Avatar person={user} size="sm" /><span className="hidden text-sm font-semibold sm:block">{fullName(user)}</span>
                </Link>
                <button onClick={logout} className="rounded-xl p-2 text-ink-500 hover:bg-slate-100 hover:text-rose-600" aria-label="Se déconnecter" title="Se déconnecter"><LogOut className="h-[18px] w-[18px]" /></button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8"><Outlet /></main>
        <footer className="px-4 pb-6 text-center text-xs text-ink-500">SkillSwap Campus · 1 crédit = 1 heure d'échange</footer>
      </div>

      {/* Menu mobile */}
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-ink-900 p-4 animate-pop">
            <div>
              <div className="mb-5 flex items-center justify-between px-2 pt-2"><Logo light /><button onClick={() => setMenu(false)} className="text-slate-300" aria-label="Fermer"><X className="h-5 w-5" /></button></div>
              {links}
            </div>
            {isAdmin && <Link to={admin ? '/' : '/admin'} onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-amber-300 hover:bg-white/10"><ShieldCheck className="h-[18px] w-[18px]" />{admin ? 'Espace étudiant' : 'Espace administrateur'}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
