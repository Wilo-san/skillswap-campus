import { useState } from 'react';
import { Search, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFetch } from '../../lib/hooks';
import { fmtFull } from '../../lib/format';
import { Avatar, ConfirmDialog, ErrorBanner, PageHeader, PageLoader, Pill, useAction, useToast } from '../../components/ui';

interface Row {
  id: string; email: string; firstName: string; lastName: string; field: string; role: 'STUDENT' | 'ADMIN';
  active: boolean; availableCredits: number; blockedCredits: number; createdAt: string; activeBookings: number;
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useFetch(() => api.get<{ users: Row[] }>(`/admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`), [search]);
  const [confirm, setConfirm] = useState<{ u: Row; kind: 'disable' | 'enable' | 'role' } | null>(null);

  const act = async () => {
    if (!confirm) return;
    const { u, kind } = confirm;
    const fn = kind === 'role'
      ? () => api.post(`/admin/users/${u.id}/role`, { role: u.role === 'ADMIN' ? 'STUDENT' : 'ADMIN' })
      : () => api.post<{ cancelledPending: number; acceptedToTreat: number }>(`/admin/users/${u.id}/active`, { active: kind === 'enable' });
    const r = await run('act', fn, kind === 'role' ? 'Rôle mis à jour.' : kind === 'enable' ? 'Compte réactivé.' : 'Compte désactivé.');
    if (r !== undefined) {
      if (kind === 'disable' && typeof r === 'object' && r && 'cancelledPending' in r) {
        const res = r as { cancelledPending: number; acceptedToTreat: number };
        if (res.acceptedToTreat > 0) toast.error(`${res.acceptedToTreat} séance(s) acceptée(s) restent à annuler depuis la page Litiges ou via l'API d'administration.`);
      }
      setConfirm(null); reload(true);
    }
  };

  return (
    <>
      <PageHeader title="Comptes" subtitle="Recherchez un étudiant, activez ou désactivez un compte, attribuez le rôle administrateur." />
      <form onSubmit={(e) => { e.preventDefault(); setSearch(q); }} className="card mb-5 flex gap-2 p-3">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-10" placeholder="Nom, prénom ou courriel…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn-primary">Rechercher</button>
      </form>
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[54rem] text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr><th className="px-4 py-3">Étudiant</th><th className="px-4 py-3">Filière</th><th className="px-4 py-3">Crédits</th><th className="px-4 py-3">Séances</th><th className="px-4 py-3">État</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar person={u} size="sm" />
                      <div><p className="font-semibold">{u.firstName} {u.lastName}</p><p className="text-xs text-ink-500">{u.email}</p></div>
                      {u.role === 'ADMIN' && <Pill tone="brand"><ShieldCheck className="h-3 w-3" />Admin</Pill>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{u.field}</td>
                  <td className="px-4 py-3"><span className="font-semibold">{u.availableCredits}</span> <span className="text-xs text-ink-500">dispo · {u.blockedCredits} bloqué(s)</span></td>
                  <td className="px-4 py-3">{u.activeBookings}</td>
                  <td className="px-4 py-3">{u.active ? <Pill tone="emerald">Actif</Pill> : <Pill tone="rose">Désactivé</Pill>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button className="btn-ghost btn-sm" disabled={!!busy || u.id === me?.id} title={u.id === me?.id ? 'Vous ne pouvez pas modifier votre propre compte' : undefined} onClick={() => setConfirm({ u, kind: u.role === 'ADMIN' ? 'role' : 'role' })}>{u.role === 'ADMIN' ? 'Retirer admin' : 'Nommer admin'}</button>
                      {u.active
                        ? <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50" disabled={!!busy || u.id === me?.id} onClick={() => setConfirm({ u, kind: 'disable' })}><UserX className="h-3.5 w-3.5" />Désactiver</button>
                        : <button className="btn-ghost btn-sm text-emerald-700 hover:bg-emerald-50" disabled={!!busy} onClick={() => setConfirm({ u, kind: 'enable' })}><UserCheck className="h-3.5 w-3.5" />Réactiver</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {data?.users.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-500">Aucun compte ne correspond à cette recherche.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-500">Inscrit depuis : {data?.users[0] ? fmtFull(data.users[0].createdAt).split(' à')[0] : '—'} (compte le plus récent).</p>

      <ConfirmDialog
        open={!!confirm}
        danger={confirm?.kind === 'disable'}
        title={confirm?.kind === 'role' ? 'Changer le rôle' : confirm?.kind === 'disable' ? 'Désactiver le compte' : 'Réactiver le compte'}
        text={confirm?.kind === 'disable'
          ? "Le compte ne pourra plus se connecter. Ses demandes en attente seront annulées et ses offres publiées repasseront en brouillon. Les séances acceptées devront être annulées séparément : aucun crédit bloqué n'est perdu."
          : confirm?.kind === 'role'
            ? `Le rôle de ${confirm.u.firstName} ${confirm.u.lastName} deviendra ${confirm.u.role === 'ADMIN' ? 'étudiant' : 'administrateur'}.`
            : `Le compte de ${confirm?.u.firstName} ${confirm?.u.lastName} pourra à nouveau se connecter.`}
        confirmLabel={confirm?.kind === 'role' ? 'Confirmer' : confirm?.kind === 'disable' ? 'Désactiver' : 'Réactiver'}
        busy={!!busy}
        onConfirm={act}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
