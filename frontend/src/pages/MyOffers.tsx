import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Eye, EyeOff, Package, Pencil, Plus, Rocket, Trash2, Undo2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Offer } from '../lib/types';
import { fmtDateTime, levelLabel, modeLabel } from '../lib/format';
import { ConfirmDialog, EmptyState, ErrorBanner, PageHeader, PageLoader, Pill, useAction } from '../components/ui';

const statusInfo = {
  DRAFT: { label: 'Brouillon', tone: 'amber' as const },
  PUBLISHED: { label: 'Publiée', tone: 'emerald' as const },
  ARCHIVED: { label: 'Archivée', tone: 'slate' as const },
};

export default function MyOffers() {
  const { data, error, loading, reload } = useFetch(() => api.get<{ offers: Offer[] }>('/offers/mine'), []);
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState<{ offer: Offer; kind: 'archive' | 'delete' | 'unpublish' } | null>(null);
  const [filter, setFilter] = useState<'ALL' | Offer['status']>('ALL');

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => { if ((await run(key, fn, msg)) !== undefined) reload(true); };

  const doConfirm = async () => {
    if (!confirm) return;
    const { offer, kind } = confirm;
    const path = kind === 'delete' ? null : `/offers/${offer.id}/${kind}`;
    const r = await run(kind + offer.id, () => (path ? api.post(path) : api.del(`/offers/${offer.id}`)), kind === 'archive' ? 'Offre archivée.' : kind === 'unpublish' ? 'Offre dépubliée.' : 'Offre supprimée.');
    if (r !== undefined) { setConfirm(null); reload(true); }
  };

  const list = (data?.offers ?? []).filter((o) => filter === 'ALL' || o.status === filter);

  return (
    <>
      <PageHeader title="Mes offres" subtitle="Créez vos offres, ajoutez des créneaux puis publiez-les pour recevoir des demandes." actions={<Link to="/offers/new" className="btn-primary"><Plus className="h-4 w-4" />Nouvelle offre</Link>} />
      <div className="mb-5 flex flex-wrap gap-2">
        {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${filter === f ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
            {f === 'ALL' ? 'Toutes' : statusInfo[f].label}
          </button>
        ))}
      </div>
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : list.length === 0 ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="Aucune offre" text="Partagez une compétence : créez votre première offre." action={<Link to="/offers/new" className="btn-primary"><Plus className="h-4 w-4" />Créer une offre</Link>} />
      ) : (
        <div className="space-y-3">
          {list.map((o) => {
            const futureSlots = o.slots.filter((s) => new Date(s.startsAt) > new Date());
            return (
              <div key={o.id} className="card p-5 animate-fadeUp">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={statusInfo[o.status].tone}>{statusInfo[o.status].label}</Pill>
                      {o.hidden && <Pill tone="rose"><EyeOff className="h-3 w-3" />Masquée par l'administrateur</Pill>}
                      <Pill>{o.category.name}</Pill><Pill>{levelLabel[o.level]}</Pill><Pill>{modeLabel[o.mode]}</Pill><Pill>{o.durationHours} h · {o.cost} crédit{o.cost > 1 ? 's' : ''}</Pill>
                    </div>
                    <Link to={`/offers/${o.id}`} className="mt-2 block text-lg font-bold hover:text-brand-700">{o.title}</Link>
                    <p className="mt-1 text-sm text-ink-500">{futureSlots.length} créneau{futureSlots.length > 1 ? 'x' : ''} à venir{futureSlots[0] && <> · prochain : {fmtDateTime(futureSlots[0].startsAt)}</>}</p>
                    {o.hidden && o.hiddenReason && <p className="mt-2 text-sm text-rose-700">Motif : {o.hiddenReason}</p>}
                  </div>
                  {(o.pendingRequests ?? 0) > 0 && <Link to="/requests" className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 ring-1 ring-amber-200"><Users className="h-4 w-4" />{o.pendingRequests} demande{(o.pendingRequests ?? 0) > 1 ? 's' : ''}</Link>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link to={`/offers/${o.id}/edit`} className="btn-secondary btn-sm"><Pencil className="h-3.5 w-3.5" />Modifier / créneaux</Link>
                  {o.status !== 'PUBLISHED' && o.status !== 'ARCHIVED' && <button className="btn-primary btn-sm" disabled={!!busy || o.hidden} onClick={() => act('pub' + o.id, () => api.post(`/offers/${o.id}/publish`), 'Offre publiée.')}><Rocket className="h-3.5 w-3.5" />Publier</button>}
                  {o.status === 'PUBLISHED' && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => setConfirm({ offer: o, kind: 'unpublish' })}><Undo2 className="h-3.5 w-3.5" />Dépublier</button>}
                  {o.status === 'ARCHIVED' && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => act('unarch' + o.id, () => api.post(`/offers/${o.id}/unpublish`), 'Offre remise en brouillon.')}><Eye className="h-3.5 w-3.5" />Remettre en brouillon</button>}
                  {o.status !== 'ARCHIVED' && <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => setConfirm({ offer: o, kind: 'archive' })}><Archive className="h-3.5 w-3.5" />Archiver</button>}
                  <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50" disabled={!!busy} onClick={() => setConfirm({ offer: o, kind: 'delete' })}><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        danger={confirm?.kind === 'delete'}
        title={confirm?.kind === 'delete' ? "Supprimer l'offre" : confirm?.kind === 'archive' ? "Archiver l'offre" : "Dépublier l'offre"}
        text={confirm?.kind === 'delete' ? "Cette action est définitive. Une offre qui a déjà reçu des demandes ne peut pas être supprimée (archivez-la plutôt)." : "Les demandes en attente seront annulées. Les séances déjà acceptées suivent leur cours normalement."}
        confirmLabel={confirm?.kind === 'delete' ? 'Supprimer' : confirm?.kind === 'archive' ? 'Archiver' : 'Dépublier'}
        busy={!!busy}
        onConfirm={doConfirm}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
