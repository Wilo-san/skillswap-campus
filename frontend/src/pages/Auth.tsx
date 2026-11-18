import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Gift, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/Layout';
import { ErrorBanner, Field, Spinner, fieldErrors } from '../components/ui';

function Shell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <Logo light />
        <div className="relative">
          <h2 className="font-display text-4xl font-extrabold leading-tight">Partagez ce que vous savez.<br /><span className="text-brand-300">Apprenez ce qui vous manque.</span></h2>
          <p className="mt-4 max-w-md text-slate-300">Une banque de temps entre étudiants : animez une séance, gagnez des crédits, puis utilisez-les pour apprendre à votre tour. Sans argent.</p>
          <ul className="mt-8 space-y-4 text-sm text-slate-200">
            <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Gift className="h-4 w-4" /></span>2 crédits offerts à l'inscription</li>
            <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Clock className="h-4 w-4" /></span>1 crédit = 1 heure d'échange</li>
            <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><ShieldCheck className="h-4 w-4" /></span>Crédits sécurisés jusqu'à la double confirmation</li>
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">EST Béni Mellal · Projet SkillSwap Campus</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md animate-fadeUp">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-3xl font-extrabold">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <p className="mt-6 text-center text-sm text-ink-500">{footer}</p>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const u = await login(email, password);
      nav(loc.state?.from ?? (u.role === 'ADMIN' ? '/admin' : '/'), { replace: true });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Shell title="Bon retour parmi nous" subtitle="Connectez-vous pour retrouver vos séances et vos crédits." footer={<>Pas encore de compte ? <Link to="/register" className="font-semibold text-brand-600 hover:underline">Créer un compte</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBanner error={error} />
        <Field label="Adresse électronique"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@etu.ac.ma" required /></Field>
        <Field label="Mot de passe"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <button className="btn-primary w-full" disabled={busy || !email || !password}>{busy ? <Spinner /> : <>Se connecter<ArrowRight className="h-4 w-4" /></>}</button>
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', field: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const fe = fieldErrors(error);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { await register(f); nav('/', { replace: true }); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Shell title="Rejoignez la communauté" subtitle="Créez votre compte et recevez 2 crédits de bienvenue." footer={<>Déjà inscrit ? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Se connecter</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBanner error={Object.keys(fe).length ? null : error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" error={fe.firstName}><input className="input" value={f.firstName} onChange={set('firstName')} autoComplete="given-name" required /></Field>
          <Field label="Nom" error={fe.lastName}><input className="input" value={f.lastName} onChange={set('lastName')} autoComplete="family-name" required /></Field>
        </div>
        <Field label="Adresse électronique" error={fe.email}><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
        <Field label="Filière" error={fe.field}><input className="input" value={f.field} onChange={set('field')} placeholder="ex. DUT Génie Informatique" required /></Field>
        <Field label="Mot de passe" error={fe.password} hint="8 caractères minimum, avec au moins une lettre et un chiffre."><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : <><Sparkles className="h-4 w-4" />Créer mon compte</>}</button>
      </form>
    </Shell>
  );
}
