// Verifie que les donnees persistent apres redemarrage du serveur et qu'un traitement
// massivement concurrent ne cree ni double transfert ni double attribution.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-persist-'))
const PORT = 4100 + Math.floor(Math.random() * 90)
const base = `http://localhost:${PORT}/api`
const env = { ...process.env, PORT: String(PORT), DATA_DIR }
let srv
const demarrer = async () => {
  srv = spawn('node', [path.join(__dirname, '../src/index.js')], { env, stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 1200))
}
const arreter = async () => {
  srv.kill('SIGKILL') // arret brutal : l'ecriture atomique doit proteger la base
  await new Promise((r) => setTimeout(r, 300))
}
let ok = 0, ko = 0
const check = (l, c) => { c ? ok++ : ko++; console.log(`${c ? 'OK  ' : 'FAIL'} ${l}`) }
async function call(p, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
const login = async (e) => (await call('/auth/login', { method: 'POST', body: { email: e, password: 'campus123' } })).data.token

try {
  await new Promise((r) => spawn('node', [path.join(__dirname, '../src/seed.js'), '--reset'], { env, stdio: 'ignore' }).on('close', r))
  await demarrer()
  const younes = await login('younes@campus.ma')
  const nbOffres = (await call('/offres?intervenant=me&statut=tous', { token: younes })).data.total
  const cree = await call('/offres', { method: 'POST', token: younes, body: { titre: 'Persistance', competence: 'Test', categorie: 'Langues', description: 'x', niveau: 'debutant', mode: 'distance', duree_heures: 1 } })
  check('Offre creee avant redemarrage', cree.status === 201)

  // Concurrence : 10 etudiants demandent le meme creneau, l'intervenant accepte 10 fois en parallele
  const H = 3600 * 1000
  const offre = (await call('/offres', { method: 'POST', token: younes, body: { titre: 'Concurrence', competence: 'Test', categorie: 'Langues', description: 'x', niveau: 'debutant', mode: 'distance', duree_heures: 1, statut: 'publiee' } })).data.offre
  const cr = (await call(`/offres/${offre.id}/creneaux`, { method: 'POST', token: younes, body: { debut: new Date(Date.now() + 48 * H).toISOString(), lieu: 'x' } })).data.creneau
  const tokens = []
  for (let i = 0; i < 10; i++) {
    const r = await call('/auth/register', { method: 'POST', body: { email: `c${i}@campus.ma`, password: 'secret1', prenom: 'C', nom: String(i) } })
    tokens.push(r.data.token)
  }
  const demandes = await Promise.all(tokens.map((t) => call('/reservations', { method: 'POST', token: t, body: { creneau_id: cr.id } })))
  check('10 demandes simultanees creees', demandes.every((d) => d.status === 201))
  const acceptations = await Promise.all(demandes.map((d) => call(`/reservations/${d.data.reservation.id}/accepter`, { method: 'POST', token: younes })))
  check('Une seule acceptation sur 10 en parallele (RG07)', acceptations.filter((a) => a.status === 200).length === 1)
  const db1 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'))
  check('Un seul blocage de credits enregistre', db1.mouvements.filter((m) => m.type === 'blocage' && db1.reservations.find((r) => r.id === m.reservation_id)?.creneau_id === cr.id).length === 1)
  check('9 demandes refusees automatiquement avec motif', db1.reservations.filter((r) => r.creneau_id === cr.id && r.statut === 'refusee' && r.motif_refus).length === 9)

  await arreter()
  await demarrer()
  const younes2 = await login('younes@campus.ma')
  check('Persistance : connexion apres redemarrage brutal', Boolean(younes2))
  check('Persistance : offres conservees', (await call('/offres?intervenant=me&statut=tous', { token: younes2 })).data.total === nbOffres + 2)
  const wallet = (await call('/credits', { token: tokens[0] })).data
  const db2 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'))
  check('Persistance : fichier JSON valide et complet', db2.reservations.length === db1.reservations.length)
  check('Soldes coherents apres redemarrage', wallet.disponible + wallet.bloque === 2)
} catch (e) {
  console.error('ERREUR', e); ko++
} finally {
  srv?.kill()
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
}
console.log(`\n${ok} OK, ${ko} echec(s)`)
process.exit(ko ? 1 : 0)
