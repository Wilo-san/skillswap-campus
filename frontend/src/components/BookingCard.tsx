import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Ban, Check, CheckCheck, Globe, Hourglass, MapPin, MessageSquareWarning, Star, Undo2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Booking } from '../lib/types';
import { disputeReasonLabel, fmtRange, fullName } from '../lib/format';
import { Avatar, ConfirmDialog, ErrorBanner, Field, Modal, Spinner, StarInput, StatusBadge, useAction } from './ui';

interface Props { booking: Booking; onChange: () => void }

export default function BookingCard({ booking: b, onChange }: Props) {
  const { user, refresh } = useAuth();
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState<null | 'refuse' | 'cancel' | 'withdraw' | 'accept' | 'confirm' | 'report' | 'review'>(null);
  const [reason, setReason] = useState('');
  const [disputeReason, setDisputeReason] = useState<keyof typeof disputeReasonLabel>('ABSENCE');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<unknown>(null);

  const other = b.myRole === 'TEACHER' ? b.learner : b.teacher;
  const iConfirmed = user ? b.confirmedBy.includes(user.id) : false;
  const otherConfirmed = b.confirmedBy.some((id) => id !== user?.id);
  const close = () => { setDlg(null); setReason(''); setComment(''); setError(null); };

  const exec = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setError(null);
    try {
      const r = await run(key, async () => { try { return await fn(); } catch (e) { setError(e); throw e; } }, msg);
      if (r !== undefined) { close(); await refresh(); onChange(); }
    } catch { /* erreur déjà affichée */ }
  };

  const accept = () => exec('accept', () => api.post(`/bookings/${b.id}/accept`), 'Demande acceptée. Les crédits du bénéficiaire sont bloqués.');
  const refuse = () => exec('refuse', () => api.post(`/bookings/${b.id}/refuse`, { reason }), 'Demande refusée.');
  const cancel = () => exec('cancel', () => api.post(`/bookings/${b.id}/cancel`, { reason }), 'Séance annulée. Les crédits ont été libérés.');
  const withdraw = () => exec('withdraw', () => api.post(`/bookings/${b.id}/withdraw`), 'Demande retirée.');
  const confirm = () => exec('confirm', () => api.post<{ settled: boolean }>(`/bookings/${b.id}/confirm`), 'Confirmation enregistrée.');
  const report = () => exec('report', () => api.post(`/bookings/${b.id}/dispute`, { reason: disputeReason, description: reason }), 'Signalement transmis à l’administrateur.');
  const review = () => exec('review', () => api.post(`/bookings/${b.id}/review`, { rating, comment }), 'Merci pour votre évaluation !');

  return (
    <div className="card p-5 animate-fadeUp">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar person={other} />
          <div className="min-w-0">
            <Link to={`/offers/${b.offer.id}`} className="block truncate text-base font-bold hover:text-brand-700">{b.offer.title}</Link>
            <p className="text-sm text-ink-500">
              {b.myRole === 'TEACHER' ? 'Bénéficiaire' : 'Intervenant'} : <Link to={`/profiles/${other.id}`} className="font-medium text-ink-700 hover:underline">{fullName(other)}</Link>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5"><StatusBadge status={b.status} /><span className="text-xs font-semibold text-ink-500">{b.cost} crédit{b.cost > 1 ? 's' : ''}</span></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-700">
        <span className="font-medium">{fmtRange(b.startsAt, b.endsAt)}</span>
        <span className="inline-flex items-center gap-1 text-ink-500">{b.offer.mode === 'REMOTE' ? <Globe className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{b.offer.mode === 'REMOTE' ? 'À distance' : 'Présentiel'}</span>
      </div>

      {(b.location || b.meetingUrl) && (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
          {b.meetingUrl && <p>Lien : <a className="font-semibold underline break-all" href={b.meetingUrl} target="_blank" rel="noreferrer noopener">{b.meetingUrl}</a></p>}
          {b.location && <p>Lieu : <strong>{b.location}</strong></p>}
        </div>
      )}
      {b.status === 'REFUSED' && b.refusalReason && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">Motif du refus : {b.refusalReason}</p>}
      {b.status === 'CANCELLED' && b.cancelReason && <p className="mt-3 rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm text-ink-700">{b.cancelReason}</p>}

      {b.status === 'ACCEPTED' && new Date(b.endsAt) <= new Date() && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-700">
          <Hourglass className="h-4 w-4 shrink-0 text-amber-500" />
          {iConfirmed ? (otherConfirmed ? 'Les deux confirmations sont enregistrées.' : "Vous avez confirmé. En attente de l'autre participant.") : otherConfirmed ? "L'autre participant a confirmé : à votre tour." : 'Séance terminée : confirmez sa réalisation pour déclencher le transfert des crédits.'}
        </p>
      )}
      {b.status === 'DISPUTED' && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3.5 py-2.5 text-sm text-orange-800"><AlertTriangle className="h-4 w-4 shrink-0" />Litige en cours : les crédits restent bloqués jusqu'à la décision de l'administrateur. {b.disputeId && <Link className="font-semibold underline" to={`/disputes/${b.disputeId}`}>Voir</Link>}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {b.can.accept && <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => setDlg('accept')}><Check className="h-3.5 w-3.5" />Accepter</button>}
        {b.can.refuse && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => setDlg('refuse')}><X className="h-3.5 w-3.5" />Refuser</button>}
        {b.can.withdraw && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => setDlg('withdraw')}><Undo2 className="h-3.5 w-3.5" />Retirer ma demande</button>}
        {b.can.confirm && <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => setDlg('confirm')}><CheckCheck className="h-3.5 w-3.5" />Confirmer la réalisation</button>}
        {b.can.cancel && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => setDlg('cancel')}><Ban className="h-3.5 w-3.5" />Annuler la séance</button>}
        {b.can.report && <button className="btn-ghost btn-sm text-orange-700 hover:bg-orange-50" disabled={!!busy} onClick={() => setDlg('report')}><MessageSquareWarning className="h-3.5 w-3.5" />Signaler un problème</button>}
        {b.can.review && <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => setDlg('review')}><Star className="h-3.5 w-3.5" />Évaluer</button>}
        {b.status === 'COMPLETED' && !b.can.review && b.myReview && <span className="inline-flex items-center gap-1 text-sm text-ink-500"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />Vous avez noté {b.myReview}/5</span>}
      </div>

      <ConfirmDialog open={dlg === 'accept'} title="Accepter la demande" text={`${b.cost} crédit${b.cost > 1 ? 's' : ''} seront bloqués sur le compte de ${b.learner.firstName}. Les autres demandes sur ce créneau seront refusées automatiquement.`} confirmLabel="Accepter" busy={busy === 'accept'} onConfirm={accept} onClose={close} />
      <ConfirmDialog open={dlg === 'withdraw'} title="Retirer la demande" text="Votre demande en attente sera annulée. Aucun crédit n'est concerné." confirmLabel="Retirer" busy={busy === 'withdraw'} onConfirm={withdraw} onClose={close} />
      <ConfirmDialog open={dlg === 'confirm'} title="Confirmer la réalisation" text="Vous attestez que la séance a bien eu lieu. Lorsque les deux participants ont confirmé, les crédits sont transférés à l'intervenant. Cette confirmation est unique." confirmLabel="Je confirme" busy={busy === 'confirm'} onConfirm={confirm} onClose={close} />

      <Modal open={dlg === 'refuse'} onClose={close} title="Refuser la demande">
        <div className="space-y-4"><ErrorBanner error={error} />
          <Field label="Motif du refus (visible par le bénéficiaire)"><textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. Je ne suis plus disponible ce jour-là." /></Field>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={close}>Retour</button><button className="btn-danger" disabled={!reason.trim() || !!busy} onClick={refuse}>{busy === 'refuse' && <Spinner />}Refuser</button></div>
        </div>
      </Modal>
      <Modal open={dlg === 'cancel'} onClose={close} title="Annuler la séance">
        <div className="space-y-4"><ErrorBanner error={error} />
          <p className="text-sm text-ink-700">Les crédits bloqués seront libérés et le créneau pourra être réservé à nouveau.</p>
          <Field label="Motif (facultatif)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={close}>Retour</button><button className="btn-danger" disabled={!!busy} onClick={cancel}>{busy === 'cancel' && <Spinner />}Annuler la séance</button></div>
        </div>
      </Modal>
      <Modal open={dlg === 'report'} onClose={close} title="Signaler un problème">
        <div className="space-y-4"><ErrorBanner error={error} />
          <p className="text-sm text-ink-700">Les crédits restent bloqués et l'administrateur examinera les éléments des deux parties.</p>
          <Field label="Nature du problème"><select className="input" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value as keyof typeof disputeReasonLabel)}>{Object.entries(disputeReasonLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Description"><textarea className="input min-h-28" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Expliquez ce qui s'est passé." /></Field>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={close}>Retour</button><button className="btn-primary" disabled={!reason.trim() || !!busy} onClick={report}>{busy === 'report' && <Spinner />}Envoyer le signalement</button></div>
        </div>
      </Modal>
      <Modal open={dlg === 'review'} onClose={close} title={`Évaluer ${other.firstName}`}>
        <div className="space-y-4"><ErrorBanner error={error} />
          <div><p className="label">Votre note</p><StarInput value={rating} onChange={setRating} /></div>
          <Field label="Commentaire (facultatif)"><textarea className="input min-h-24" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} /></Field>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={close}>Retour</button><button className="btn-primary" disabled={!!busy} onClick={review}>{busy === 'review' && <Spinner />}Publier l'évaluation</button></div>
        </div>
      </Modal>
    </div>
  );
}
