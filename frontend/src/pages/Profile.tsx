import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Save, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Me } from '../lib/types';
import { fmtFull } from '../lib/format';
import { Avatar, ErrorBanner, Field, PageHeader, Spinner, TagInput, fieldErrors, useAction, useToast } from '../components/ui';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();
  const [form, setForm] = useState({ firstName: '', lastName: '', field: '', bio: '', offeredSkills: [] as string[], wantedSkills: [] as string[] });
  const [error, setError] = useState<unknown>(null);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  const [pwdError, setPwdError] = useState<unknown>(null);

  useEffect(() => {
    if (!user) return;
    setForm({ firstName: user.firstName, lastName: user.lastName, field: user.field, bio: user.bio, offeredSkills: user.offeredSkills, wantedSkills: user.wantedSkills });
  }, [user]);

  if (!user) return null;
  const fe = fieldErrors(error);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await run('save', () => api.put<{ user: Me }>('/auth/me', form), 'Profil enregistré.');
      if (r) setUser(r.user);
    } catch (err) { setError(err); }
  };

  const changePwd = async (e: FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    const r = await run('pwd', async () => { try { return await api.put('/auth/password', pwd); } catch (err) { setPwdError(err); throw err; } });
    if (r) { setPwd({ currentPassword: '', newPassword: '' }); toast.success('Mot de passe modifié.'); }
  };

  return (
    <>
      <PageHeader title="Mon profil" subtitle="Votre profil public aide les autres étudiants à vous connaître. Votre adresse électronique et votre solde restent privés." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <form onSubmit={save} className="card space-y-4 p-6" noValidate>
          <h2 className="flex items-center gap-2 text-base font-bold"><UserRound className="h-5 w-5 text-brand-600" />Informations</h2>
          <ErrorBanner error={Object.keys(fe).length ? null : error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" error={fe.firstName}><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
            <Field label="Nom" error={fe.lastName}><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          </div>
          <Field label="Filière" error={fe.field}><input className="input" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} /></Field>
          <Field label="Présentation" error={fe.bio} hint="Quelques lignes sur vous et votre façon d'enseigner."><textarea className="input min-h-28" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={1000} /></Field>
          <Field label="Compétences que je propose" hint="Elles apparaissent sur votre profil public. Appuyez sur Entrée pour ajouter."><TagInput value={form.offeredSkills} onChange={(v) => setForm({ ...form, offeredSkills: v })} placeholder="ex. Python, Anglais…" /></Field>
          <Field label="Compétences que je recherche" hint="Elles alimentent vos suggestions dans le catalogue."><TagInput value={form.wantedSkills} onChange={(v) => setForm({ ...form, wantedSkills: v })} placeholder="ex. Excel, Design…" /></Field>
          <div className="flex justify-end"><button className="btn-primary" disabled={!!busy}>{busy === 'save' ? <Spinner /> : <Save className="h-4 w-4" />}Enregistrer</button></div>
        </form>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3"><Avatar person={user} size="lg" /><div><p className="font-bold">{user.firstName} {user.lastName}</p><p className="text-xs text-ink-500">{user.email}</p></div></div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Rôle</dt><dd className="font-semibold">{user.role === 'ADMIN' ? 'Administrateur' : 'Étudiant'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Crédits disponibles</dt><dd className="font-semibold">{user.availableCredits}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Crédits bloqués</dt><dd className="font-semibold">{user.blockedCredits}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Inscrit le</dt><dd className="font-semibold">{fmtFull(user.createdAt).split(' à')[0]}</dd></div>
            </dl>
          </div>

          <form onSubmit={changePwd} className="card space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-base font-bold"><KeyRound className="h-5 w-5 text-brand-600" />Mot de passe</h2>
            <ErrorBanner error={pwdError} />
            <Field label="Mot de passe actuel"><input className="input" type="password" autoComplete="current-password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} required /></Field>
            <Field label="Nouveau mot de passe" hint="8 caractères minimum, lettres et chiffres."><input className="input" type="password" autoComplete="new-password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} required /></Field>
            <button className="btn-secondary w-full" disabled={!!busy || !pwd.currentPassword || !pwd.newPassword}>{busy === 'pwd' && <Spinner />}Modifier le mot de passe</button>
          </form>
        </div>
      </div>
    </>
  );
}
