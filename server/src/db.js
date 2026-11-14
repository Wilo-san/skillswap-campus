import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
export const DB_PATH = path.join(DATA_DIR, 'db.json')

export const CREDITS_BIENVENUE = 2

const EMPTY = {
  users: [],
  profils: [],
  categories: [],
  offres: [],
  creneaux: [],
  reservations: [],
  mouvements: [],
  litiges: [],
  evaluations: [],
  notifications: [],
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

// Ecriture atomique (fichier temporaire puis renommage) : la base ne peut pas etre corrompue
// par un arret brutal. Toutes les routes sont synchrones : Node execute une requete a la fois
// entre deux "await", ce qui evite les doubles transferts et doubles attributions (RG07, RG11, RG14).
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

/* ------------------------------------------------------------------ */
/* Credits : solde disponible, montant bloque, historique (RG16)       */
/* ------------------------------------------------------------------ */

// Types de mouvement : bienvenue (+), blocage (-disponible, +bloque), liberation (+disponible, -bloque),
// transfert_emis (-bloque, beneficiaire), transfert_recu (+disponible, intervenant)
export function portefeuille(userId) {
  let disponible = 0
  let bloque = 0
  for (const m of get().mouvements) {
    if (m.user_id !== userId) continue
    const q = Number(m.quantite || 0)
    switch (m.type) {
      case 'bienvenue':
      case 'transfert_recu':
        disponible += q
        break
      case 'blocage':
        disponible -= q
        bloque += q
        break
      case 'liberation':
        disponible += q
        bloque -= q
        break
      case 'transfert_emis':
        bloque -= q
        break
      default:
        break
    }
  }
  return { disponible, bloque }
}

export const solde = (userId) => portefeuille(userId).disponible

export function mouvement({ user_id, reservation_id = null, type, quantite, description }) {
  const entry = {
    id: uid(),
    user_id,
    reservation_id,
    type,
    quantite: Math.abs(Number(quantite)),
    description,
    date: now(),
  }
  get().mouvements.push(entry)
  const p = portefeuille(user_id)
  if (p.disponible < 0 || p.bloque < 0) {
    // Garde-fou RG16 : on annule l'ecriture et on signale l'incoherence.
    get().mouvements.pop()
    throw new Error('Incoherence de credits (solde negatif refuse).')
  }
  const profil = get().profils.find((x) => x.user_id === user_id)
  if (profil) {
    profil.solde_credits = p.disponible
    profil.credits_bloques = p.bloque
  }
  return entry
}

export function notifier(userId, message, lien = null) {
  get().notifications.push({ id: uid(), user_id: userId, message, lien, lue: false, date: now() })
}

/* ------------------------------------------------------------------ */
/* Profils / evaluations                                               */
/* ------------------------------------------------------------------ */

export function noteMoyenne(userId) {
  const notes = get().evaluations.filter((e) => e.cible_id === userId)
  if (!notes.length) return { moyenne: null, total: 0 }
  const somme = notes.reduce((t, e) => t + e.note, 0)
  return { moyenne: Math.round((somme / notes.length) * 10) / 10, total: notes.length }
}

export function publicUser(user) {
  if (!user) return null
  const profil = get().profils.find((p) => p.user_id === user.id) || null
  const wallet = portefeuille(user.id)
  const note = noteMoyenne(user.id)
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    statut: user.statut || 'actif',
    prenom: profil?.prenom || '',
    nom: profil?.nom || '',
    filiere: profil?.filiere || '',
    bio: profil?.bio || '',
    competences_proposees: profil?.competences_proposees || [],
    competences_recherchees: profil?.competences_recherchees || [],
    solde_credits: wallet.disponible,
    credits_bloques: wallet.bloque,
    note_moyenne: note.moyenne,
    nb_evaluations: note.total,
  }
}

export function nomComplet(userId) {
  const profil = get().profils.find((p) => p.user_id === userId)
  if (!profil) return 'Etudiant'
  return `${profil.prenom || ''} ${profil.nom || ''}`.trim() || 'Etudiant'
}

export function estActif(userId) {
  const u = get().users.find((x) => x.id === userId)
  return Boolean(u) && (u.statut || 'actif') === 'actif'
}

/* ------------------------------------------------------------------ */
/* Regles horaires                                                     */
/* ------------------------------------------------------------------ */

export const STATUTS_OCCUPES = ['acceptee', 'en_litige']

export function chevauche(debutA, finA, debutB, finB) {
  return new Date(debutA) < new Date(finB) && new Date(debutB) < new Date(finA)
}

// RG08 : deux seances acceptees ne se chevauchent pas pour un etudiant (intervenant ou beneficiaire).
// Les seances consecutives (fin == debut) sont autorisees.
export function conflitPlanning(userId, creneau, ignoreReservationId = null) {
  const db = get()
  return db.reservations.some((r) => {
    if (r.id === ignoreReservationId) return false
    if (!STATUTS_OCCUPES.includes(r.statut)) return false
    if (r.intervenant_id !== userId && r.beneficiaire_id !== userId) return false
    const autre = db.creneaux.find((c) => c.id === r.creneau_id)
    return autre && chevauche(creneau.debut, creneau.fin, autre.debut, autre.fin)
  })
}
