import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, StatCard } from '../components/ui.jsx'
import { apiGet, apiPut } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'

function listeDepuisTexte(texte) {
  return texte
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

export default function Profil() {
  const { user, refresh } = useAuth()
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    filiere: '',
    bio: '',
    competences_proposees: '',
    competences_recherchees: '',
  })
  const [stats, setStats] = useState(null)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!user) return
    setForm({
      prenom: user.prenom || '',
      nom: user.nom || '',
      filiere: user.filiere || '',
      bio: user.bio || '',
      competences_proposees: (user.competences_proposees || []).join(', '),
      competences_recherchees: (user.competences_recherchees || []).join(', '),
    })
    apiGet('/dashboard')
      .then((d) => setStats(d.stats))
      .catch(() => {})
  }, [user?.id])

  async function enregistrer(e) {
    e.preventDefault()
    setErreur('')
    setSucces('')
    setEnvoi(true)
    try {
      await apiPut('/auth/profil', {
        prenom: form.prenom,
        nom: form.nom,
        filiere: form.filiere,
        bio: form.bio,
        competences_proposees: listeDepuisTexte(form.competences_proposees),
        competences_recherchees: listeDepuisTexte(form.competences_recherchees),
      })
      await refresh()
      setSucces('Profil mis à jour.')
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="space-y-5 fade-in">
      <header>
        <h1 className="text-2xl">Mon profil</h1>
        <p className="mt-1 text-sm text-ink-500">
          {user?.email} · {user?.role === 'admin' ? 'Administrateur' : 'Étudiant'}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Crédits" value={`${user?.solde_credits ?? 0} dispo.`} hint={`${user?.credits_bloques ?? 0} bloqué(s)`} tone="brand" />
        <StatCard label="Offres publiées" value={stats?.offres_publiees ?? 0} tone="accent" />
        <StatCard label="Ma note" value={user?.note_moyenne != null ? `★ ${user.note_moyenne}` : '—'} hint={<Link to={`/etudiants/${user?.id}`} className="link">Voir mes évaluations ({user?.nb_evaluations ?? 0})</Link>} tone="ink" />
      </section>

      <section className="card p-6">
        <form onSubmit={enregistrer} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="prenom">
                Prénom
              </label>
              <input
                id="prenom"
                className="input"
                value={form.prenom}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="nom">
                Nom
              </label>
              <input
                id="nom"
                className="input"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="filiere">
              Filière
            </label>
            <input
              id="filiere"
              className="input"
              value={form.filiere}
              onChange={(e) => setForm({ ...form, filiere: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="bio">
              Bio
            </label>
            <textarea
              id="bio"
              rows={3}
              className="input"
              maxLength={600}
              placeholder="Ce que tu étudies, ce que tu aimes expliquer..."
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="proposees">
                Compétences proposées
              </label>
              <input
                id="proposees"
                className="input"
                placeholder="SQL, React, UML"
                value={form.competences_proposees}
                onChange={(e) => setForm({ ...form, competences_proposees: e.target.value })}
              />
              <p className="mt-1 text-xs text-ink-400">Sépare par des virgules.</p>
            </div>
            <div>
              <label className="label" htmlFor="recherchees">
                Compétences recherchées
              </label>
              <input
                id="recherchees"
                className="input"
                placeholder="Machine learning, Anglais"
                value={form.competences_recherchees}
                onChange={(e) => setForm({ ...form, competences_recherchees: e.target.value })}
              />
              <p className="mt-1 text-xs text-ink-400">Ce que tu aimerais apprendre.</p>
            </div>
          </div>

          {succes && <Alert tone="success">{succes}</Alert>}
          {erreur && <Alert tone="error">{erreur}</Alert>}

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={envoi}>
              {envoi ? 'Enregistrement...' : 'Enregistrer le profil'}
            </button>
          </div>
        </form>
      </section>

      {(user?.competences_proposees?.length > 0 || user?.competences_recherchees?.length > 0) && (
        <section className="card p-6">
          <h2 className="text-base font-semibold">Vu par les autres étudiants</h2>
          <div className="mt-3 space-y-3">
            {[
              { titre: 'Propose', items: user.competences_proposees, classes: 'bg-brand-50 text-brand-700' },
              { titre: 'Recherche', items: user.competences_recherchees, classes: 'bg-emerald-50 text-emerald-700' },
            ].map((bloc) => (
              <div key={bloc.titre}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{bloc.titre}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(bloc.items || []).length === 0 && <span className="text-sm text-ink-400">Aucune</span>}
                  {(bloc.items || []).map((item) => (
                    <span key={item} className={`badge ${bloc.classes}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
