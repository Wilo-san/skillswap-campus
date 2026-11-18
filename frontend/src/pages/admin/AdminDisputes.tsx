import { useState } from 'react';
import { Gavel, Scale } from 'lucide-react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import type { Dispute } from '../../lib/types';
import { disputeReasonLabel, fmtFull, fullName } from '../../lib/format';
import { Avatar, EmptyState, ErrorBanner, Field, Modal, PageHeader, PageLoader, Pill, Spinner, useAction } from '../../components/ui';

export default function AdminDisputes() {
  const [tab, setTab] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const { data, error, loading, reload } = useFetch(() => api.get<{ disputes: Dispute[] }>(`/admin/disputes?status=${tab}`), [tab]);
  const { busy, run } = useAction();
  const [target, setTarget] = useState<{ d: Dispute; decision: 'TRANSFER' | 'REFUND' } | null>(null);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<unknown>(null);

  const resolve = async () => {
    if (!target) return;
    setFormError(null);
    const r = await run('resolve', async () => { try { return await api.post(`/admin/disputes/${target.d.id}/resolve`, { decision: target.decision, note }); } catch (e) { setFormError(e); throw e; } }, 'Litige réglé : le transfert est unique.');
    if (r !== undefined) { setTarget(null); setNote(''); reload(true); }
  };

  return (
    <>
      <PageHeader title="Litiges" subtitle="Examinez les éléments des deux parties, puis décidez du transfert à l'intervenant ou de la restitution au bénéficiaire. Le règlement est unique et motivé." />
      <div className="mb-5 flex gap-2">
        {([['OPEN', 'À traiter'], ['RESOLVED', 'Réglés'], ['ALL', 'Tous']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>
      <ErrorBanner error={error} />
      {loading ? <PageLoader /> : (data?.disputes.length ?? 0) === 0 ? <EmptyState icon={<Gavel className="h-6 w-6" />} title="Aucun litige" text={tab === 'OPEN' ? 'Aucun signalement en attente de traitement.' : 'Aucun litige dans cette liste.'} /> : (
        <div className="space-y-4">
          {data!.disputes.map((d) => (
            <div key={d.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold">{d.booking.offer.title}</p>
                  <p className="text-sm text-ink-500">{disputeReasonLabel[d.reason]} · séance du {fmtFull(d.booking.startsAt)} · {d.booking.cost} crédit{d.booking.cost > 1 ? 's' : ''} en jeu</p>
                </div>
                <Pill tone={d.status === 'OPEN' ? 'amber' : 'emerald'}>{d.status === 'OPEN' ? 'En examen' : d.decision === 'TRANSFER' ? 'Transfert' : 'Restitution'}</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold uppercase text-ink-500">Intervenant</p><p className="mt-0.5 flex items-center gap-2 font-medium"><Avatar person={d.booking.teacher} size="sm" />{fullName(d.booking.teacher)}</p><p className="mt-1 text-xs text-ink-500">Confirmé : {d.booking.confirmations.some((c) => c.userId === d.booking.teacher.id) ? 'oui' : 'non'}</p></div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold uppercase text-ink-500">Bénéficiaire</p><p className="mt-0.5 flex items-center gap-2 font-medium"><Avatar person={d.booking.learner} size="sm" />{fullName(d.booking.learner)}</p><p className="mt-1 text-xs text-ink-500">Confirmé : {d.booking.confirmations.some((c) => c.userId === d.booking.learner.id) ? 'oui' : 'non'}</p></div>
              </div>
              <ul className="mt-3 space-y-2">
                {d.comments.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                    <p className="text-xs font-semibold text-ink-700">{c.author ? fullName(c.author) : 'Participant'} <span className="font-normal text-ink-500">· {fmtFull(c.createdAt)}</span></p>
                    <p className="mt-1 whitespace-pre-line text-ink-700">{c.content}</p>
                  </li>
                ))}
              </ul>
              {d.status === 'OPEN' ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => { setTarget({ d, decision: 'TRANSFER' }); setNote(''); setFormError(null); }}><Scale className="h-3.5 w-3.5" />Transférer à l'intervenant</button>
                  <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => { setTarget({ d, decision: 'REFUND' }); setNote(''); setFormError(null); }}><Scale className="h-3.5 w-3.5" />Restituer au bénéficiaire</button>
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Décision :</strong> {d.decision === 'TRANSFER' ? 'transfert à l’intervenant' : 'restitution au bénéficiaire'} · {d.decisionNote} <span className="text-xs text-emerald-700">({d.decidedAt && fmtFull(d.decidedAt)})</span></p>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.decision === 'TRANSFER' ? "Transférer les crédits à l'intervenant" : 'Restituer les crédits au bénéficiaire'}>
        <div className="space-y-4">
          <ErrorBanner error={formError} />
          <p className="text-sm text-ink-700">
            {target?.decision === 'TRANSFER'
              ? `Les ${target.d.booking.cost} crédits bloqués seront transférés à ${fullName(target.d.booking.teacher)} et la séance marquée comme réalisée.`
              : `Les ${target?.d.booking.cost} crédits bloqués seront restitués à ${target ? fullName(target.d.booking.learner) : ''}.`}
            {' '}Cette décision est définitive : un second règlement est impossible.
          </p>
          <Field label="Motivation de la décision (transmise aux deux parties)"><textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. Les deux parties confirment la tenue de la séance…" /></Field>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setTarget(null)}>Retour</button><button className="btn-primary" disabled={note.trim().length < 3 || !!busy} onClick={resolve}>{busy === 'resolve' && <Spinner />}Confirmer la décision</button></div>
        </div>
      </Modal>
    </>
  );
}
