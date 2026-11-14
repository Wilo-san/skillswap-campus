import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
export const DB_PATH = path.join(DATA_DIR, 'db.json')

const EMPTY = {
  users: [],
  profils: [],
  categories: [],
  offres: [],
  creneaux: [],
  reservations: [],
  mouvements: [],
}

let db = null

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function load() {
  ensureDir()
  if (!fs.existsSync(DB_PATH)) {
    db = structuredClone(EMPTY)
    save()
    return db
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
    db = { ...structuredClone(EMPTY), ...raw }
  } catch (err) {
    console.error('[db] fichier illisible, reinitialisation:', err.message)
    db = structuredClone(EMPTY)
    save()
  }
  return db
}

export function get() {
  if (!db) load()
  return db
}

export function save() {
  ensureDir()
  const tmp = `${DB_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, DB_PATH)
}

export function reset() {
  db = structuredClone(EMPTY)
  save()
  return db
}

export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()

export function solde(userId) {
  return get()
    .mouvements.filter((m) => m.user_id === userId)
    .reduce((total, m) => total + Number(m.quantite || 0), 0)
}

export function mouvement({ user_id, reservation_id = null, type, quantite, description }) {
  const entry = {
    id: uid(),
    user_id,
    reservation_id,
    type,
    quantite: Number(quantite),
    description,
    date: now(),
  }
  get().mouvements.push(entry)
  const profil = get().profils.find((p) => p.user_id === user_id)
  if (profil) profil.solde_credits = solde(user_id)
  return entry
}

export function publicUser(user) {
  if (!user) return null
  const profil = get().profils.find((p) => p.user_id === user.id) || null
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    prenom: profil?.prenom || '',
    nom: profil?.nom || '',
    filiere: profil?.filiere || '',
    bio: profil?.bio || '',
    competences_proposees: profil?.competences_proposees || [],
    competences_recherchees: profil?.competences_recherchees || [],
    solde_credits: solde(user.id),
  }
}

export function nomComplet(userId) {
  const profil = get().profils.find((p) => p.user_id === userId)
  if (!profil) return 'Etudiant'
  return `${profil.prenom || ''} ${profil.nom || ''}`.trim() || 'Etudiant'
}
