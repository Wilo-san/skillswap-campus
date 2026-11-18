import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Coins, Gift, Info, Lock, RotateCcw, Wallet as WalletIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { LedgerEntry } from '../lib/types';
import { fmtFull, ledgerLabel } from '../lib/format';
import { EmptyState, ErrorBanner, PageHeader, PageLoader } from '../components/ui';

const tone: Record<LedgerEntry['type'], { cls: string; icon: typeof Coins; sign: string }> = {
  WELCOME_BONUS: { cls: 'bg-brand-50 text-brand-700', icon: Gift, sign: '+' },
  BLOCK: { cls: 'bg-amber-50 text-amber-700', icon: Lock, sign: '' },
  RELEASE: { cls: 'bg-slate-100 text-ink-700', icon: RotateCcw, sign: '' },
  TRANSFER_OUT: { cls: 'bg-rose-50 text-rose-700', icon: ArrowUpRight, sign: '−' },
  TRANSFER_IN: { cls: 'bg-emerald-50 text-emerald-700', icon: ArrowDownLeft, sign: '+' },
  REFUND: { cls: 'bg-sky-50 text-sky-700', icon: RotateCcw, sign: '+' },
};

export default function Wallet() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useFetch(() => api.get<{ available: number; blocked: number; entries: LedgerEntry[]; total: number; pageSize: number }>(`/wallet?page=${page}`), [page]);

  return (
    <>
      <PageHeader title="Mes crédits" subtitle="Un crédit correspond à une heure d'échange. Animez une séance pour en gagner, réservez-en pour en utiliser." />
      <ErrorBanner error={error} />
      {loading && !data ? <PageLoader /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
              <div className="flex items-center justify-between"><p className="text-sm font-medium text-brand-100">Disponibles</p><WalletIcon className="h-5 w-5 text-brand-200" /></div>
              <p className="mt-3 font-display text-4xl font-extrabold">{data.available}</p>
              <p className="mt-1 text-xs text-brand-100">Utilisables immédiatement</p>
            </div>
            <div className="card p-6">
              <div className="flex items-center justify-between"><p className="text-sm font-medium text-ink-500">Bloqués</p><Lock className="h-5 w-5 text-amber-500" /></div>
              <p className="mt-3 font-display text-4xl font-extrabold text-amber-600">{data.blocked}</p>
              <p className="mt-1 text-xs text-ink-500">Séances acceptées, non encore réalisées</p>
            </div>
            <div className="card p-6">
              <div className="flex items-center justify-between"><p className="text-sm font-medium text-ink-500">Total</p><Coins className="h-5 w-5 text-ink-500" /></div>
              <p className="mt-3 font-display text-4xl font-extrabold">{data.available + data.blocked}</p>
              <p className="mt-1 text-xs text-ink-500">Solde global du compte</p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3.5 text-sm text-brand-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Le coût est bloqué sur votre compte dès que l'intervenant accepte la demande. Il est transféré après confirmation de la réalisation par les deux participants, ou restitué en cas d'annulation avant le début ou de décision favorable de l'administrateur.</p>
          </div>

          <h2 className="mb-3 mt-8 text-lg font-bold">Historique des mouvements</h2>
          {data.entries.length === 0 ? <EmptyState icon={<Coins className="h-6 w-6" />} title="Aucun mouvement" text="Votre historique apparaîtra ici dès votre première séance." /> : (
            <>
              <ul className="card divide-y divide-slate-100">
                {data.entries.map((e) => {
                  const t = tone[e.type];
                  const Icon = t.icon;
                  return (
                    <li key={e.id} className="flex items-center gap-3 p-4">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.cls}`}><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{ledgerLabel[e.type]}</p>
                        <p className="truncate text-xs text-ink-500">
                          {fmtFull(e.createdAt)}
                          {e.booking && <> · <Link to="/bookings" className="hover:underline">{e.booking.title}</Link></>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${e.type === 'TRANSFER_IN' || e.type === 'WELCOME_BONUS' || e.type === 'REFUND' ? 'text-emerald-600' : e.type === 'TRANSFER_OUT' ? 'text-rose-600' : 'text-ink-700'}`}>{t.sign}{e.amount}</p>
                        <p className="text-[11px] text-ink-500">{e.availableAfter} dispo · {e.blockedAfter} bloqué</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {data.total > data.pageSize && (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</button>
                  <span className="text-ink-500">Page {page} sur {Math.ceil(data.total / data.pageSize)}</span>
                  <button className="btn-secondary btn-sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Suivant</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
