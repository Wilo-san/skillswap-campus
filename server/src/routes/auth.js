import { Router } from 'express'
import { get, save, uid, now, publicUser, mouvement, nomComplet } from '../db.js'
import { hashPassword, checkPassword, signToken, requireAuth } from '../auth.js'

const router = Router()
const SOLDE_INITIAL = 5

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

router.post('/register', (req, res) => {
  const { email, password, prenom, nom, filiere } = req.body || {}
  if (!email || !password || !prenom || !nom) {
    return res.status(400).json({ error: 'Email, mot de passe, prenom et nom sont obligatoires.' })
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caracteres.' })
  }
  const db = get()
  const mail = normalizeEmail(email)
  if (db.users.some((u) => u.email === mail)) {
    return res.status(409).json({ error: 'Un compte existe deja avec cet email.' })
  }

  const user = {
    id: uid(),
    email: mail,
    password_hash: hashPassword(password),
    role: db.users.length === 0 ? 'admin' : 'etudiant',
    created_at: now(),
  }
  db.users.push(user)
  db.profils.push({
    id: uid(),
    user_id: user.id,
    prenom: String(prenom).trim(),
    nom: String(nom).trim(),
    filiere: String(filiere || '').trim(),
    bio: '',
    competences_proposees: [],
    competences_recherchees: [],
    solde_credits: SOLDE_INITIAL,
    statut: 'actif',
    created_at: now(),
  })
  mouvement({
    user_id: user.id,
    type: 'bonus',
    quantite: SOLDE_INITIAL,
    description: 'Solde de bienvenue',
  })
  save()

  return res.status(201).json({ token: signToken(user), user: publicUser(user) })
})

router.post('/login', (req, res) => {
  const { email, password } = req.body || {}
  const mail = normalizeEmail(email)
  const user = get().users.find((u) => u.email === mail)
  if (!user || !checkPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' })
  }
  res.json({ token: signToken(user), user: publicUser(user) })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.me, nom: nomComplet(req.user.id) })
})

router.put('/profil', requireAuth, (req, res) => {
  const db = get()
  const profil = db.profils.find((p) => p.user_id === req.user.id)
  if (!profil) return res.status(404).json({ error: 'Profil introuvable.' })
  const { prenom, nom, filiere, bio, competences_proposees, competences_recherchees } = req.body || {}

  if (prenom !== undefined) profil.prenom = String(prenom).trim()
  if (nom !== undefined) profil.nom = String(nom).trim()
  if (filiere !== undefined) profil.filiere = String(filiere).trim()
  if (bio !== undefined) profil.bio = String(bio).trim().slice(0, 600)
  if (Array.isArray(competences_proposees)) {
    profil.competences_proposees = competences_proposees.map((c) => String(c).trim()).filter(Boolean).slice(0, 12)
  }
  if (Array.isArray(competences_recherchees)) {
    profil.competences_recherchees = competences_recherchees.map((c) => String(c).trim()).filter(Boolean).slice(0, 12)
  }
  profil.updated_at = now()
  save()
  res.json({ user: publicUser(req.user) })
})

export default router
