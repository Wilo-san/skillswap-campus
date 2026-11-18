import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Lock, Rocket, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { Category, Offer } from '../lib/types';
import { fmtRange } from '../lib/format';
import { ErrorBanner, Field, PageHeader, PageLoader, Spinner, fieldErrors, useAction } from '../components/ui';

const empty = { title: '', categoryId: '', skill: '', description: '', level: 'BEGINNER', durationHours: 1, mode: 'REMOTE' };

/** Convertit une saisie datetime-local (heure locale) en ISO. */
const toIso = (v: string) => new Date(v).toISOString();
const addHours = (v: string, h: number) => {
  if (!v) return '';
  const d = new Date(v);
  d.setHours(d.getHours() + h);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function OfferForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const { busy, run } = useAction();
  const cats = useFetch(() => api.get<{ categories: Category[] }>('/categories'), []);
  const existing = useFetch(() => (id ? api.get<{ offer: Offer }>(`/offers/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState<unknown>(null);
  const [slot, setSlot] = useState({ start: '', location: '', meetingUrl: '' });
  const [slotError, setSlotError] = useState<unknown>(null);

  useEffect(() => {
    const o = existing.data?.offer;
    if (o) setForm({ title: o.title, categoryId: o.category.id, skill: o.skill, description: o.description, level: o.level, durationHours: o.durationHours, mode: o.mode });
  }, [existing.data]);

  if (editing && existing.loading) return <PageLoader />;
  const offer = existing.data?.offer;
  const fe = fieldErrors(error);
  const set = (k: keyof typeof form, v: string | number) => setForm({ ...form, [k]: v });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const body = { ...form, durationHours: Number(form.durationHours) };
      if (editing) {
        const r = await run('save', () => api.put<{ offer: Offer }>(`/offers/${id}`, body), 'Offre enregistrée.');
        if (r) existing.reload(true);
      } else {
        const r = await run('save', () => api.post<{ offer: Offer }>('/offers', body), 'Offre créée en brouillon. Ajoutez maintenant des créneaux.');
        if (r) nav(`/offers/${r.offer.id}/edit`, { replace: true });
      }
    } catch (err) { setError(err); }
  };

  const addSlot = async (e: FormEvent) => {
    e.preventDefault();
    if (!slot.start) return;
    setSlotError(null);
    const body = {
      startsAt: toIso(slot.start),
      endsAt: toIso(addHours(slot.start, form.durationHours)),
      location: form.mode === 'ONSITE' ? slot.location : null,
      meetingUrl: form.mode === 'REMOTE' ? slot.meetingUrl : null,
    };
    try {
      await api.post(`/offers/${id}/slots`, body);
      setSlot({ start: '', location: '', meetingUrl: '' });
      existing.reload(true);
    } catch (err) { setSlotError(err); }
  };

  const delSlot = async (slotId: string) => {
    const r = await run('del' + slotId, async () => { try { return await api.del(`/offers/${id}/slots/${slotId}`); } catch (e) { existing.reload(true); throw e; } }, 'Créneau supprimé.');
    if (r !== undefined) existing.reload(true);
  };

  const publish = async () => {
    const r = await run('pub', () => api.post(`/offers/${id}/publish`), 'Offre publiée : elle apparaît maintenant dans le catalogue.');
    if (r !== undefined) nav('/offers');
  };

  const locked = offer ? offer.slots.some((s) => s.status === 'ASSIGNED') : false;

  return (
    <>
      <Link to="/offers" className="btn-ghost -ml-3 mb-3"><ArrowLeft className="h-4 w-4" />Mes offres</Link>
      <PageHeader title={editing ? "Modifier l'offre" : 'Nouvelle offre'} subtitle="Une séance est individuelle : un intervenant, un bénéficiaire, un créneau. Le coût est égal à la durée (1 h = 1 crédit)." />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <form onSubmit={save} className="card space-y-4 p-6" noValidate>
          <ErrorBanner error={Object.keys(fe).length ? null : error} />
          <Field label="Titre" error={fe.title}><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="ex. Initiation à Python" maxLength={150} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Catégorie" error={fe.categoryId}>
              <select className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">Choisir…</option>{cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Compétence" error={fe.skill}><input className="input" value={form.skill} onChange={(e) => set('skill', e.target.value)} placeholder="ex. Python" /></Field>
          </div>
          <Field label="Description" error={fe.description}><textarea className="input min-h-32" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ce que vous allez transmettre, le prérequis, le déroulé…" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Niveau" error={fe.level}>
              <select className="input" value={form.level} onChange={(e) => set('level', e.target.value)}><option value="BEGINNER">Débutant</option><option value="INTERMEDIATE">Intermédiaire</option><option value="ADVANCED">Avancé</option></select>
            </Field>
            <Field label="Durée" error={fe.durationHours} hint={locked ? 'Verrouillée : une séance est acceptée.' : undefined}>
              <select className="input" value={form.durationHours} disabled={locked} onChange={(e) => set('durationHours', Number(e.target.value))}><option value={1}>1 heure (1 crédit)</option><option value={2}>2 heures (2 crédits)</option></select>
            </Field>
            <Field label="Mode" error={fe.mode}>
              <select className="input" value={form.mode} onChange={(e) => set('mode', e.target.value)}><option value="REMOTE">À distance</option><option value="ONSITE">Présentiel</option></select>
            </Field>
          </div>
          <div className="flex justify-end pt-2"><button className="btn-primary" disabled={!!busy}>{busy === 'save' ? <Spinner /> : <Save className="h-4 w-4" />}{editing ? 'Enregistrer' : 'Créer le brouillon'}</button></div>
        </form>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold"><CalendarPlus className="h-5 w-5 text-brand-600" />Créneaux</h2>
            {!editing ? <p className="mt-2 text-sm text-ink-500">Enregistrez d'abord l'offre pour ajouter des créneaux.</p> : (
              <>
                <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Le lieu ou le lien n'est visible que des participants.</p>
                <ul className="mt-3 space-y-2">
                  {offer?.slots.length === 0 && <li className="rounded-xl bg-slate-50 p-3 text-sm text-ink-500">Aucun créneau pour l'instant.</li>}
                  {offer?.slots.map((s) => (
                    <li key={s.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3">
                      <div className="min-w-0"><p className="text-sm font-semibold">{fmtRange(s.startsAt, s.endsAt)}</p><p className="truncate text-xs text-ink-500">{s.location ?? s.meetingUrl}</p>{s.status === 'ASSIGNED' && <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Attribué</span>}</div>
                      {s.status !== 'ASSIGNED' && <button className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" onClick={() => delSlot(s.id)} aria-label="Supprimer le créneau"><Trash2 className="h-4 w-4" /></button>}
                    </li>
                  ))}
                </ul>
                <form onSubmit={addSlot} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <ErrorBanner error={slotError} />
                  <Field label="Début" hint={`Fin automatique : +${form.durationHours} h`}><input className="input" type="datetime-local" value={slot.start} min={addHours(new Date().toISOString().slice(0, 16), 0)} onChange={(e) => setSlot({ ...slot, start: e.target.value })} required /></Field>
                  {form.mode === 'ONSITE'
                    ? <Field label="Lieu précis"><input className="input" value={slot.location} onChange={(e) => setSlot({ ...slot, location: e.target.value })} placeholder="ex. EST Béni Mellal, salle B12" required /></Field>
                    : <Field label="Lien de réunion"><input className="input" type="url" value={slot.meetingUrl} onChange={(e) => setSlot({ ...slot, meetingUrl: e.target.value })} placeholder="https://meet.google.com/…" required /></Field>}
                  <button className="btn-secondary w-full"><CalendarPlus className="h-4 w-4" />Ajouter le créneau</button>
                </form>
              </>
            )}
          </div>
          {editing && offer && offer.status !== 'PUBLISHED' && offer.status !== 'ARCHIVED' && (
            <button className="btn-primary w-full" onClick={publish} disabled={!!busy || offer.hidden}>{busy === 'pub' ? <Spinner /> : <Rocket className="h-4 w-4" />}Publier l'offre</button>
          )}
        </div>
      </div>
    </>
  );
}
