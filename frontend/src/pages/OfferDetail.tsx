import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Clock, EyeOff, Globe, Lock, MapPin, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import type { Booking, Offer } from '../lib/types';
import { fmtRange, fullName, levelLabel, modeLabel } from '../lib/format';
import { Avatar, ConfirmDialog, ErrorBanner, PageLoader, Pill, Stars, useAction } from '../components/ui';

export default function OfferDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const { data, error, loading, reload } = useFetch(() => api.get<{ offer: Offer }>(`/offers/${id}`), [id]);
  const { busy, run } = useAction();
  const [pick, setPick] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (loading) return <PageLoader />;
  if (error || !data) return <><Link to="/catalog" className="btn-ghost mb-4"><ArrowLeft className="h-4 w-4" />Retour</Link><ErrorBanner error={error ?? new Error('Offre introuvable.')} /></>;
  const o = data.offer;
  const available = o.slots.filter((s) => s.status === 'AVAILABLE');
  const slotToConfirm = o.slots.find((s) => s.id === pick);
  const notEnough = user ? user.availableCredits < o.cost : false;

  const request = async () => {
    if (!pick) return;
    const r = await run('request', () => api.post<{ booking: Booking }>('/bookings', { slotId: pick }), 'Demande envoyée. Vous serez notifié de la décision.');
    if (r) { setConfirmOpen(false); setPick(null); await refresh(); nav('/bookings'); }
  };

  return (
    <>
      <Link to={o.mine ? '/offers' : '/catalog'} className="btn-ghost -ml-3 mb-3"><ArrowLeft className="h-4 w-4" />Retour</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="card p-6 animate-fadeUp">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="brand">{o.category.name}</Pill><Pill>{o.skill}</Pill><Pill>{levelLabel[o.level]}</Pill>
              <Pill>{o.mode === 'REMOTE' ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{modeLabel[o.mode]}</Pill>
              <Pill><Clock className="h-3 w-3" />{o.durationHours} h</Pill>
              {o.status !== 'PUBLISHED' && <Pill tone="amber">{o.status === 'DRAFT' ? 'Brouillon' : 'Archivée'}</Pill>}
              {o.hidden && <Pill tone="rose"><EyeOff className="h-3 w-3" />Masquée</Pill>}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">{o.title}</h1>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-700">{o.description}</p>
            {o.hidden && o.hiddenReason && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Offre masquée par l'administrateur : {o.hiddenReason}</p>}
          </div>

          <div className="card p-6">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><CalendarClock className="h-5 w-5 text-brand-600" />Créneaux</h2>
            <p className="mb-4 flex items-center gap-1.5 text-xs text-ink-500"><Lock className="h-3.5 w-3.5" />Le lieu précis ou le lien de réunion est communiqué aux seuls participants une fois la demande acceptée.</p>
            {available.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-ink-500">Aucun créneau disponible pour le moment.</p> : (
              <ul className="space-y-2">
                {available.map((s) => (
                  <li key={s.id}>
                    <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition ${pick === s.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-brand-200'} ${o.mine ? 'cursor-default' : ''}`}>
                      <span className="flex items-center gap-3">
                        {!o.mine && <input type="radio" name="slot" className="h-4 w-4 accent-brand-600" checked={pick === s.id} onChange={() => setPick(s.id)} />}
                        <span className="text-sm font-semibold">{fmtRange(s.startsAt, s.endsAt)}</span>
                      </span>
                      {o.mine && (s.location || s.meetingUrl) && <span className="truncate text-xs text-ink-500">{s.location ?? s.meetingUrl}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Intervenant</p>
            <Link to={`/profiles/${o.teacher.id}`} className="flex items-center gap-3 hover:opacity-80">
              <Avatar person={o.teacher} size="lg" />
              <div><p className="font-bold">{fullName(o.teacher)}</p><p className="text-xs text-ink-500">{o.teacher.field}</p>
                <div className="mt-1 flex items-center gap-1.5"><Stars value={o.teacherRating?.avg ?? null} /><span className="text-xs text-ink-500">{o.teacherRating?.avg ? `${o.teacherRating.avg} (${o.teacherRating.count})` : 'Pas encore noté'}</span></div>
              </div>
            </Link>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Coût de la séance</p>
            <p className="mt-1 font-display text-4xl font-extrabold text-brand-700">{o.cost}<span className="ml-1 text-base font-semibold text-ink-500">crédit{o.cost > 1 ? 's' : ''}</span></p>
            {o.mine ? (
              <Link to={`/offers/${o.id}/edit`} className="btn-secondary mt-4 w-full"><Pencil className="h-4 w-4" />Modifier mon offre</Link>
            ) : (
              <>
                {user && <p className="mt-2 text-xs text-ink-500">Votre solde disponible : <strong className="text-ink-900">{user.availableCredits}</strong>. Aucun crédit n'est bloqué avant l'acceptation par l'intervenant.</p>}
                {notEnough && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Solde insuffisant pour cette séance. Animez une séance pour gagner des crédits.</p>}
                <button className="btn-primary mt-4 w-full" disabled={!pick || notEnough || o.status !== 'PUBLISHED'} onClick={() => setConfirmOpen(true)}>
                  Demander cette séance
                </button>
                {!pick && !notEnough && <p className="mt-2 text-center text-xs text-ink-500">Sélectionnez un créneau pour continuer.</p>}
              </>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmer la demande"
        text={slotToConfirm ? `Vous demandez « ${o.title} » le ${fmtRange(slotToConfirm.startsAt, slotToConfirm.endsAt)}. Le coût (${o.cost} crédit${o.cost > 1 ? 's' : ''}) sera bloqué seulement si ${o.teacher.firstName} accepte.` : ''}
        confirmLabel="Envoyer la demande"
        busy={busy === 'request'}
        onConfirm={request}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
