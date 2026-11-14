import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'

const DEMO = [
  { email: 'admin@campus.ma', role: 'Administrateur' },
  { email: 'salima@campus.ma', role: 'Étudiante · SQL' },
  { email: 'younes@campus.ma', role: 'Étudiant · React' },
]

export default function AuthPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({
    email: '',
    password: '',
    prenom: '',
    nom: '',
    filiere: '',
  })
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(false)

  const update = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setErreur('')
    setChargement(true)
    try {
      if (mode === 'login') await login(form.email, form.password)
      else
        await register({
          email: form.email,
          password: form.password,
          prenom: form.prenom,
          nom: form.nom,
          filiere: form.filiere,
        })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setErreur(err.message)
    } finally {
      setChargement(false)
    }
  }

  function remplirDemo(email) {
    setMode('login')
    setForm((f) => ({ ...f, email, password: 'campus123' }))
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 font-display text-xl backdrop-blur">
              S
            </span>
            <div>
              <p className="font-display text-lg leading-tight">SkillSwap Campus</p>
              <p className="text-xs uppercase tracking-[0.2em] text-brand-200">Échange de compétences</p>
            </div>
          </div>
          <h1 className="mt-16 max-w-md font-display text-4xl leading-tight">
            Tu sais faire quelque chose. Quelqu’un d’autre sait faire le reste.
          </h1>
          <p className="mt-4 max-w-md text-sm text-ink-200">
            Une banque de temps entre étudiants : un crédit équivaut à une heure. Anime une séance, gagne des crédits, puis utilise-les pour apprendre à ton tour. Deux crédits offerts à l’inscription.
          </p>
        </div>
        <ul className="relative mt-10 space-y-3 text-sm text-ink-200">
          {[
            'Recherche par compétence, catégorie, niveau, date et mode',
            'Crédits bloqués à l’acceptation, transférés après double confirmation',
            'Évaluations, signalements et arbitrage par un administrateur',
          ].map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20 text-xs text-emerald-300">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="relative text-xs text-ink-400">EST Béni Mellal · DUT GI S3 · GL & Modélisation UML</p>
      </div>

      <div className="flex items-center justify-center bg-ink-50 px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-display text-white">S</span>
            <span className="font-display text-base text-ink-900">SkillSwap Campus</span>
          </div>

          <div className="card p-6">
            <div className="mb-5 flex rounded-xl bg-ink-100 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 rounded-lg py-2 transition ${mode === 'login' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`flex-1 rounded-lg py-2 transition ${mode === 'register' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
              >
                Créer un compte
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="prenom">
                      Prenom
                    </label>
                    <input id="prenom" className="input" value={form.prenom} onChange={update('prenom')} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="nom">
                      Nom
                    </label>
                    <input id="nom" className="input" value={form.nom} onChange={update('nom')} required />
                  </div>
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label className="label" htmlFor="filiere">
                    Filière
                  </label>
                  <input
                    id="filiere"
                    className="input"
                    placeholder="Génie logiciel"
                    value={form.filiere}
                    onChange={update('filiere')}
                  />
                </div>
              )}

              <div>
                <label className="label" htmlFor="email">
                  Email universitaire
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="prenom@campus.ma"
                  value={form.email}
                  onChange={update('email')}
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  placeholder="Au moins 6 caractères"
                  value={form.password}
                  onChange={update('password')}
                  required
                />
              </div>

              {erreur && <Alert tone="error">{erreur}</Alert>}

              <button type="submit" className="btn-primary w-full" disabled={chargement}>
                {chargement ? 'Un instant...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-ink-500">
              {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà inscrit ?'}{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setErreur('')
                  setMode(mode === 'login' ? 'register' : 'login')
                }}
              >
                {mode === 'login' ? 'Inscris-toi en 30 secondes' : 'Connecte-toi'}
              </button>
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-ink-200 bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Comptes de démonstration</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO.map((compte) => (
                <button
                  key={compte.email}
                  type="button"
                  onClick={() => remplirDemo(compte.email)}
                  className="chip hover:bg-brand-50 hover:text-brand-700"
                  title={`Mot de passe : campus123`}
                >
                  {compte.email}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-400">Mot de passe commun : campus123</p>
          </div>
        </div>
      </div>
    </div>
  )
}
