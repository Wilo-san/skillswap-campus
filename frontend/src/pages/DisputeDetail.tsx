import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Gavel, MessageSquare, Scale } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import type { Dispute } from '../lib/types';
import { disputeReasonLabel, fmtFull, fullName } from '../lib/format';
import { Avatar, ErrorBanner, PageHeader, PageLoader, Pill, Spinner, useAction } from '../components/ui';

export default function DisputeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useFetch(() => api.get<{ dispute: Dispute }>(`/disputes/${id}`), [id]);
  const [message, setMessage] = useState('');
  const [sendError, setSendError] = useState<unknown>(null);

  if (loading) return <PageLoader />;
  if (error || !data) return <><Link to="/disputes" className="btn-ghost -mb-2"><ArrowLeft className="h-4 w-4" />Retour</Link><ErrorBanner error={error ?? new Error('Litige introuvable.')} /></>;
  const d = data.dispute;

  const send = async () => {
    setSendError(null);
    const r = await run('send', async () => { try { return await api.post(`/disputes/${d.id}/comments`, { content: message }); } catch (e) { setSendError(e); throw e; } }, 'Message ajouté.');
    if (r) { setMessage(''); reload(true); }
  };

  return (
    <>
      <Link to="/disputes" className="btn-ghost -ml-3 mb-3"><ArrowLeft className="h-4 w-4" />Signalements</Link>
      <PageHeader title={d.booking.offer.title} subtitle={`Litige ouvert le ${fmtFull(d.createdAt)} · ${disputeReasonLabel[d.reason]}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold"><MessageSquare className="h-4 w-4 text-brand-600" />Éléments échangés</h2>
            <ul className="mt-4 space-y-4">
              {d.comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  {c.author ? <Avatar person={c.author} size="sm" /> : <span className="h-7 w-7 rounded-full bg-slate-200" />}
                  <div className="min-w-0 flex-1 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold">{c.author ? fullName(c.author) : 'Participant'}{c.authorId === user?.id && ' (vous)'} <span className="font-normal text-ink-500">· {fmtFull(c.createdAt)}</span></p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{c.content}</p>
                  </div>
                </li>
              ))}
            </ul>
            {d.status === 'OPEN' ? (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <ErrorBanner error={sendError} className="mb-2" />
                <textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Apportez un élément, une précision…" />
                <div className="mt-2 flex justify-end"><button className="btn-primary btn-sm" disabled={!message.trim() || !!busy} onClick={send}>{busy === 'send' && <Spinner />}Envoyer</button></div>
              </div>
            ) : <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-ink-700">Ce litige est clôturé : les messages ne sont plus acceptés.</p>}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Séance concernée</p>
            <p className="mt-2 text-sm font-bold">{d.booking.offer.title}</p>
            <p className="text-sm text-ink-500">{fmtFull(d.booking.startsAt)}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Intervenant</dt><dd className="font-medium">{fullName(d.booking.teacher)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Bénéficiaire</dt><dd className="font-medium">{fullName(d.booking.learner)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Crédits en jeu</dt><dd className="font-medium">{d.booking.cost}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Confirmations</dt><dd className="font-medium">{d.booking.confirmations.length}/2</dd></div>
            </dl>
          </div>
          <div className={`card p-5 ${d.status === 'OPEN' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="flex items-center gap-2 text-sm font-bold">{d.status === 'OPEN' ? <><Gavel className="h-4 w-4" />En cours d'examen</> : <><Scale className="h-4 w-4" />Décision rendue</>}</p>
            <p className="mt-2 text-sm text-ink-700">
              {d.status === 'OPEN'
                ? 'Les crédits restent bloqués. L’administrateur examine les éléments des deux parties, puis décide du transfert à l’intervenant ou de la restitution au bénéficiaire.'
                : <><Pill tone="emerald">{d.decision === 'TRANSFER' ? 'Transfert à l’intervenant' : 'Restitution au bénéficiaire'}</Pill><span className="mt-2 block">{d.decisionNote}</span><span className="mt-1 block text-xs text-ink-500">{d.decidedAt && fmtFull(d.decidedAt)}</span></>}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
