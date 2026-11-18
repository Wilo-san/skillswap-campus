import { useState } from 'react';
import { Eye, EyeOff, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { fmtDateTime, fullName, levelLabel, modeLabel } from '../../lib/format';
import { EmptyState, ErrorBanner, Field, Modal, PageHeader, PageLoader, Pill, Spinner, useAction } from '../../components/ui';

interface AdminOffer {
  id: string; title: string; skill: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; hidden: boolean; hiddenReason: string | null;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'; mode: 'ONSITE' | 'REMOTE'; durationHours: number; updatedAt: string;
  teacher: { id: string; firstName: string; lastName: string; field: string }; category: { id: string; name: string }; bookingCount: number;
}

const tabs = [{ k: 'PUBLISHED', l: 'Publiées' }, { k: 'DRAFT', l: 'Brouillons' }, { k: 'ARCHIVED', l: 'Archivées' }, { k: 'hidden', l: 'Masquées' }] as const;

export default function AdminOffers() {
  const [tab, setTab] = useState<(typeof tabs)[number]['k']>('PUBLISHED');
  const { data, error, loading, reload } = useFetch(() => api.get<{ offers: AdminOffer[] }>(`/admin/offers?status=${tab}`), [tab]);
  const { busy, run } = useAction();
  const [hide, setHide] = useState<AdminOffer | null>(null);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<unknown>(null);

  const doHide = async () => {
    if (!hide) return;
    setFormError(null);
    const r = await run('hide', async () => { try { return await api.post(`/admin/offers/${hide.id}/hide`, { reason }); } catch (e) { setFormError(e); throw e; } }, 'Offre masquée. Les demandes en attente ont été annulées.');
    if (r !== undefined) { setHide(null); setReason(''); reload(true); }
  };
  const unhide = async (o: AdminOffer) => { if ((await run('u' + o.id, () => api.post(`/admin/offers/${o.id}/unhide`), 'Offre rétablie.')) !== undefined) reload(true); };

  return (
    <>
      <PageHeader title="Modération des offres" subtitle="Masquez une offre non conforme : elle disparaît du catalogue et ses demandes en attente sont annulées. Les séances déjà acceptées suivent leur cours." />
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${tab === t.k ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{t.l}</button>)}
      </div>
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : (data?.offers.length ?? 0) === 0 ? <EmptyState icon={<Tag className="h-6 w-6" />} title="Aucune offre" text="Cette liste est vide." /> : (
        <div className="space-y-3">
          {data!.offers.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill>{o.category.name}</Pill><Pill>{levelLabel[o.level]}</Pill><Pill>{modeLabel[o.mode]}</Pill><Pill>{o.durationHours} h</Pill>
                    {o.status === 'DRAFT' && <Pill tone="amber">Brouillon</Pill>}
                    {o.status === 'ARCHIVED' && <Pill>Archivée</Pill>}
                    {o.hidden && <Pill tone="rose"><EyeOff className="h-3 w-3" />Masquée</Pill>}
                  </div>
                  <Link to={`/offers/${o.id}`} className="mt-2 block text-base font-bold hover:text-brand-700">{o.title}</Link>
                  <p className="text-sm text-ink-500">{fullName(o.teacher)} · {o.teacher.field} · {o.bookingCount} demande{o.bookingCount > 1 ? 's' : ''} · mise à jour le {fmtDateTime(o.updatedAt)}</p>
                  {o.hidden && o.hiddenReason && <p className="mt-1.5 text-sm text-rose-700">Motif : {o.hiddenReason}</p>}
                </div>
                {o.hidden
                  ? <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => unhide(o)}><Eye className="h-3.5 w-3.5" />Rétablir</button>
                  : <button className="btn-secondary btn-sm text-rose-600 hover:bg-rose-50" disabled={!!busy} onClick={() => { setHide(o); setReason(''); setFormError(null); }}><EyeOff className="h-3.5 w-3.5" />Masquer</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!hide} onClose={() => setHide(null)} title="Masquer l'offre">
        <div className="space-y-4">
          <ErrorBanner error={formError} />
          <p className="text-sm text-ink-700">L'offre « {hide?.title} » ne sera plus visible et ses demandes en attente seront annulées. L'intervenant est notifié avec le motif.</p>
          <Field label="Motif (transmis à l'intervenant)"><textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. Contenu inapproprié, doublon…" /></Field>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setHide(null)}>Retour</button><button className="btn-danger" disabled={reason.trim().length < 3 || !!busy} onClick={doHide}>{busy === 'hide' && <Spinner />}Masquer</button></div>
        </div>
      </Modal>
    </>
  );
}
