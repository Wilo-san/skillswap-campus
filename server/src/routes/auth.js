import { Router } from 'express'
import { get, save, uid, now, publicUser, mouvement, nomComplet, noteMoyenne, CREDITS_BIENVENUE } from '../db.js'
import { hashPassword, checkPassword, signToken, requireAuth } from '../auth.js'

const router = Router()
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

router.post('/register', (req, res) => {
  const { email, password, prenom, nom, filiere } = req.body || {}
  if (!email || !password || !prenom || !nom) {
    return res.status(400).json({ error: 'Email, mot de passe, prénom et nom sont obligatoires.' })
  }
  const mail = normalizeEmail(email)
  if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: 'Adresse électronique invalide.' })
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' })
  }
  const db = get()
  // RG01 : une adresse identifie un seul compte
  if (db.users.some((u) => u.email === mail)) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse électronique.' })
  }

  const user = {
    id: uid(),
    email: mail,
    password_hash: hashPassword(password),
    role: db.users.length === 0 ? 'admin' : 'etudiant',
    statut: 'actif',
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
    solde_credits: 0,
    credits_bloques: 0,
    created_at: now(),
  })
  // RG01 : 2 credits de bienvenue, une seule fois, a la creation du compte
  mouvement({ user_id: user.id, type: 'bienvenue', quantite: CREDITS_BIENVENUE, description: 'Crédits de bienvenue' })
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
  // RG18 : un compte desactive ne peut plus se connecter
  if ((user.statut || 'actif') !== 'actif') {
    return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez un administrateur.' })
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

  if (prenom !== undefined) {
    if (!String(prenom).trim()) return res.status(400).json({ error: 'Le prénom ne peut pas être vide.' })
    profil.prenom = String(prenom).trim()
  }
  if (nom !== undefined) {
    if (!String(nom).trim()) return res.status(400).json({ error: 'Le nom ne peut pas être vide.' })
    profil.nom = String(nom).trim()
  }
  if (filiere !== undefined) profil.filiere = String(filiere).trim()
  if (bio !== undefined) profil.bio = String(bio).trim().slice(0, 600)
  const liste = (v) => v.map((c) => String(c).trim()).filter(Boolean).slice(0, 12)
  if (Array.isArray(competences_proposees)) profil.competences_proposees = liste(competences_proposees)
  if (Array.isArray(competences_recherchees)) profil.competences_recherchees = liste(competences_recherchees)
  profil.updated_at = now()
  save()
  res.json({ user: publicUser(req.user) })
})

// Profil public d'un etudiant avec evaluations (note moyenne)
router.get('/profils/:id', requireAuth, (req, res) => {
  const db = get()
  const user = db.users.find((u) => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' })
  const profil = db.profils.find((p) => p.user_id === user.id)
  const evaluations = db.evaluations
    .filter((e) => e.cible_id === user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((e) => ({ ...e, auteur_nom: nomComplet(e.auteur_id) }))
  const note = noteMoyenne(user.id)
  res.json({
    profil: {
      id: user.id,
      nom_complet: nomComplet(user.id),
      filiere: profil?.filiere || '',
      bio: profil?.bio || '',
      competences_proposees: profil?.competences_proposees || [],
      competences_recherchees: profil?.competences_recherchees || [],
      note_moyenne: note.moyenne,
      nb_evaluations: note.total,
    },
    evaluations,
  })
})

export default router
