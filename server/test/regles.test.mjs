// Test d'integration des regles de gestion RG01 a RG19.
// Lance le serveur sur une base temporaire puis execute les scenarios via HTTP.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'skillswap-test-'))
const PORT = 3900 + Math.floor(Math.random() * 90)
const base = `http://localhost:${PORT}/api`
const env = { ...process.env, PORT: String(PORT), DATA_DIR }

const seed = spawn('node', [path.join(__dirname, '../src/seed.js'), '--reset'], { env, stdio: 'ignore' })
await new Promise((r) => seed.on('close', r))
const srv = spawn('node', [path.join(__dirname, '../src/index.js')], { env, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))

let ok = 0
let ko = 0
const check = (label, cond) => {
  if (cond) ok++
  else ko++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`)
}
async function call(p, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}
const login = async (e) => (await call('/auth/login', { method: 'POST', body: { email: e, password: 'campus123' } })).data.token
const H = 3600 * 1000
const iso = (ms) => new Date(Date.now() + ms).toISOString()

try {
  const admin = await login('admin@campus.ma')
  const salima = await login('salima@campus.ma')
  const younes = await login('younes@campus.ma')
  const kaouthar = await login('kaouthar@campus.ma')
  const hajar = await login('hajar@campus.ma')

  // RG01
  const reg = await call('/auth/register', { method: 'POST', body: { email: 'Nouveau@campus.ma', password: 'secret1', prenom: 'Nour', nom: 'Test', filiere: 'GI' } })
  check('RG01 inscription : 2 credits de bienvenue', reg.data.user?.solde_credits === 2 && reg.data.user?.credits_bloques === 0)
  const dup = await call('/auth/register', { method: 'POST', body: { email: 'nouveau@campus.ma', password: 'secret1', prenom: 'N', nom: 'T' } })
  check('RG01 courriel deja utilise refuse (409)', dup.status === 409)
  const bad = await call('/auth/login', { method: 'POST', body: { email: 'nouveau@campus.ma', password: 'faux' } })
  check('Identifiants incorrects (401)', bad.status === 401)
  const nour = reg.data.token

  // Offre : validation, duree 1 ou 2 h (RG02), brouillon -> publiee (RG04)
  const incomplete = await call('/offres', { method: 'POST', token: younes, body: { titre: 'x' } })
  check('Offre incomplete refusee (400)', incomplete.status === 400)
  const dur3 = await call('/offres', { method: 'POST', token: younes, body: { titre: 'T', competence: 'C', categorie: 'Langues', description: 'd', niveau: 'debutant', mode: 'distance', duree_heures: 3 } })
  check('RG02 duree 3h refusee', dur3.status === 400)
  const off = await call('/offres', { method: 'POST', token: younes, body: { titre: 'Node.js express', competence: 'Node.js', categorie: 'Informatique & programmation', description: 'API REST', niveau: 'intermediaire', mode: 'distance', duree_heures: 2 } })
  check('RG02 offre 2h = cout 2 credits, creee en brouillon', off.data.offre?.cout_credits === 2 && off.data.offre?.statut === 'brouillon')
  const offreId = off.data.offre.id
  const c1 = await call(`/offres/${offreId}/creneaux`, { method: 'POST', token: younes, body: { debut: iso(30 * H), lieu: 'https://meet/x' } })
  check('Creneau ajoute (fin = debut + duree)', c1.status === 201 && new Date(c1.data.creneau.fin) - new Date(c1.data.creneau.debut) === 2 * H)
  const brouillon = await call(`/reservations`, { method: 'POST', token: nour, body: { creneau_id: c1.data.creneau.id } })
  check('RG04 offre brouillon : demande refusee', brouillon.status === 409)
  await call(`/offres/${offreId}`, { method: 'PUT', token: younes, body: { statut: 'publiee' } })
  const cat = await call('/offres?q=node')
  check('Recherche : offre publiee avec creneau futur visible', cat.data.total === 1)
  check('RG19 lieu masque dans le catalogue public', cat.data.offres[0].creneaux[0].lieu === null)
  const aucune = await call('/offres?q=zzzzintrouvable')
  check('Recherche sans correspondance', aucune.data.total === 0)
  const parDate = await call(`/offres?date=${iso(30 * H).slice(0, 10)}`)
  check('Recherche par date', parDate.data.offres.some((o) => o.id === offreId))

  // RG03
  const propre = await call('/reservations', { method: 'POST', token: younes, body: { creneau_id: c1.data.creneau.id } })
  check('RG03 propre offre refusee', propre.status === 400)
  // RG05 solde insuffisant : Nour a 2 credits -> ok pour 2h ; on cree une offre 2h et Kaouthar a 0 dispo
  const insuf = await call('/reservations', { method: 'POST', token: kaouthar, body: { creneau_id: c1.data.creneau.id } })
  check('RG05 solde insuffisant a la demande (409)', insuf.status === 409 && /insuffisant/i.test(insuf.data.error))
  const dem = await call('/reservations', { method: 'POST', token: nour, body: { creneau_id: c1.data.creneau.id } })
  check('Demande creee en attente, aucun credit bloque (RG05)', dem.status === 201 && dem.data.reservation.statut === 'en_attente')
  check('RG05 demande en attente ne bloque rien', (await call('/credits', { token: nour })).data.bloque === 0)
  const doublon = await call('/reservations', { method: 'POST', token: nour, body: { creneau_id: c1.data.creneau.id } })
  check('RG03 doublon refuse', doublon.status === 409)
  const resaId = dem.data.reservation.id
  check('RG19 lieu non visible avant acceptation pour le beneficiaire', dem.data.reservation.lieu === null)

  // Autre demandeur sur le meme creneau (Hajar a 1 credit -> insuffisant pour 2h) : on utilise Younes -> impossible. On utilise l'admin (2 credits)
  const dem2 = await call('/reservations', { method: 'POST', token: admin, body: { creneau_id: c1.data.creneau.id } })
  check('Deux demandes en attente possibles sur un creneau', dem2.status === 201)

  // Droits : un tiers ne peut pas accepter
  const tiers = await call(`/reservations/${resaId}/accepter`, { method: 'POST', token: kaouthar })
  check('Droits : un tiers ne peut pas accepter (403)', tiers.status === 403)

  // RG06 + RG07 acceptation concurrente (double clic)
  const [a1, a2] = await Promise.all([
    call(`/reservations/${resaId}/accepter`, { method: 'POST', token: younes }),
    call(`/reservations/${resaId}/accepter`, { method: 'POST', token: younes }),
  ])
  const accepts = [a1, a2].filter((r) => r.status === 200).length
  check('Double clic accepter : une seule acceptation', accepts === 1)
  const w = (await call('/credits', { token: nour })).data
  check('RG06 acceptation bloque 2 credits (disponible 0, bloque 2)', w.disponible === 0 && w.bloque === 2)
  const r2 = (await call(`/reservations/${dem2.data.reservation.id}`, { token: admin })).data.reservation
  check('RG07 autre demande refusee automatiquement avec motif', r2.statut === 'refusee' && /attribué/.test(r2.motif_refus))
  const nourResa = (await call(`/reservations/${resaId}`, { token: nour })).data.reservation
  check('RG19 lieu visible du beneficiaire apres acceptation', nourResa.lieu === 'https://meet/x')
  const tiersResa = await call(`/reservations/${resaId}`, { token: kaouthar })
  check('RG19 reservation inaccessible a un tiers (403)', tiersResa.status === 403)
  const dejaAttr = await call('/reservations', { method: 'POST', token: salima, body: { creneau_id: c1.data.creneau.id } })
  check('Creneau deja attribue refuse', dejaAttr.status === 409)

  // RG08 conflit de planning : Younes (intervenant) a une seance a +30h ; Salima propose un creneau qui chevauche cote Younes
  const offSalima = (await call('/offres', { method: 'POST', token: salima, body: { titre: 'Chevauchement', competence: 'SQL', categorie: 'Langues', description: 'd', niveau: 'debutant', mode: 'distance', duree_heures: 1, statut: 'publiee' } })).data.offre
  const cChev = (await call(`/offres/${offSalima.id}/creneaux`, { method: 'POST', token: salima, body: { debut: iso(31 * H), lieu: 'x' } })).data.creneau
  // Hajar (1 credit) demande ; elle n'a pas de conflit. On fait demander Younes (a une seance a +30..+32h) -> conflit a l'acceptation
  await call('/offres/' + offSalima.id, { method: 'PUT', token: salima, body: { statut: 'publiee' } })
  const dChev = await call('/reservations', { method: 'POST', token: younes, body: { creneau_id: cChev.id } })
  check('Demande sur creneau chevauchant autorisee (controle a l acceptation)', dChev.status === 201)
  const aChev = await call(`/reservations/${dChev.data.reservation.id}/accepter`, { method: 'POST', token: salima })
  check('RG08 conflit de planning refuse a l acceptation', aChev.status === 409 && /planning/i.test(aChev.data.error))
  // seances consecutives autorisees : creneau commençant exactement a la fin (+32h)
  const cConsec = (await call(`/offres/${offSalima.id}/creneaux`, { method: 'POST', token: salima, body: { debut: iso(32 * H), lieu: 'x' } })).data.creneau
  const dConsec = await call('/reservations', { method: 'POST', token: younes, body: { creneau_id: cConsec.id } })
  const aConsec = await call(`/reservations/${dConsec.data.reservation.id}/accepter`, { method: 'POST', token: salima })
  check('RG08 seances consecutives autorisees', aConsec.status === 200)

  // RG10 annulation avant debut
  const ann = await call(`/reservations/${resaId}/annuler`, { method: 'POST', token: nour, body: { motif: 'Imprévu' } })
  check('RG10 annulation avant debut OK', ann.status === 200 && ann.data.reservation.statut === 'annulee')
  const w2 = (await call('/credits', { token: nour })).data
  check('RG10 credits liberes (disponible 2, bloque 0)', w2.disponible === 2 && w2.bloque === 0)
  const lib = (await call(`/offres/${offreId}`, { token: younes })).data.offre.creneaux.find((c) => c.id === c1.data.creneau.id)
  check('RG10 creneau de nouveau libre', lib.statut === 'libre')
  const re = await call(`/reservations/${resaId}/annuler`, { method: 'POST', token: nour })
  check('Annuler deux fois refuse (409)', re.status === 409)

  // Refus motive
  const dem3 = await call('/reservations', { method: 'POST', token: nour, body: { creneau_id: c1.data.creneau.id } })
  const refSansMotif = await call(`/reservations/${dem3.data.reservation.id}/refuser`, { method: 'POST', token: younes, body: {} })
  check('Refus sans motif refuse (400)', refSansMotif.status === 400)
  const ref = await call(`/reservations/${dem3.data.reservation.id}/refuser`, { method: 'POST', token: younes, body: { motif: 'Indisponible ce jour-là' } })
  check('Refus motive OK', ref.status === 200 && ref.data.reservation.statut === 'refusee')
  const notifs = (await call('/notifications', { token: nour })).data
  check('Notification de la decision', notifs.notifications.some((n) => /refus/i.test(n.message)))
  // Retrait par le beneficiaire
  const dem4 = await call('/reservations', { method: 'POST', token: nour, body: { creneau_id: c1.data.creneau.id } })
  const retr = await call(`/reservations/${dem4.data.reservation.id}/retirer`, { method: 'POST', token: nour })
  check('RG09 demande retiree par le beneficiaire', retr.status === 200 && retr.data.reservation.statut === 'annulee')

  // Seance passee du seed : Hajar a donne Arduino a Younes, Hajar a deja confirme
  const resYounes = (await call('/reservations?role=envoyees', { token: younes })).data.reservations.find((r) => r.statut === 'acceptee' && r.fin_passee)
  check('Seed : seance passee a confirmer', Boolean(resYounes))
  // RG11 confirmation avant la fin refusee : on cree une seance future acceptee
  const avant = await call(`/reservations/${resaId}/confirmer`, { method: 'POST', token: nour })
  check('Confirmation sur reservation annulee refusee', avant.status === 409)
  // RG11 : confirmations puis transfert unique (double clic)
  const younesAvant = (await call('/credits', { token: younes })).data
  const [x1, x2] = await Promise.all([
    call(`/reservations/${resYounes.id}/confirmer`, { method: 'POST', token: younes }),
    call(`/reservations/${resYounes.id}/confirmer`, { method: 'POST', token: younes }),
  ])
  check('RG11 une seule confirmation par participant (double clic)', [x1, x2].filter((r) => r.status === 200).length === 1)
  const hajarAvant = (await call('/credits', { token: hajar })).data
  const apres = (await call(`/reservations/${resYounes.id}`, { token: younes })).data.reservation
  check('RG11 seance realisee apres 2 confirmations', apres.statut === 'realisee')
  const hajarApres = (await call('/credits', { token: hajar })).data
  check('RG11 transfert unique : intervenant credite de 2', hajarApres.disponible === 3 || hajarApres.disponible >= 3)
  const youn = (await call('/credits', { token: younes })).data
  check('RG16 beneficiaire : bloque diminue de 2, disponible inchange', youn.bloque === younesAvant.bloque - 2 && youn.disponible === younesAvant.disponible && !youn.mouvements.some((m) => m.reservation_id === resYounes.id && m.type === 'liberation'))
  const encore = await call(`/reservations/${resYounes.id}/confirmer`, { method: 'POST', token: hajar })
  check('RG14 pas de second transfert (409)', encore.status === 409)
  const histo = youn.mouvements.filter((m) => m.reservation_id === resYounes.id).map((m) => m.type).sort()
  check('Historique : blocage + transfert_emis avec seance concernee', histo.includes('blocage') && histo.includes('transfert_emis') && youn.mouvements.find((m) => m.reservation_id === resYounes.id).seance)

  // RG15 evaluations
  const nonRealisee = await call(`/reservations/${resaId}/evaluer`, { method: 'POST', token: nour, body: { note: 4 } })
  check('RG15 evaluation refusee sur seance non realisee', nonRealisee.status === 409)
  const noteInvalide = await call(`/reservations/${resYounes.id}/evaluer`, { method: 'POST', token: younes, body: { note: 7 } })
  check('Note hors 1..5 refusee', noteInvalide.status === 400)
  const ev = await call(`/reservations/${resYounes.id}/evaluer`, { method: 'POST', token: younes, body: { note: 5, commentaire: 'Excellent' } })
  check('Evaluation deposee', ev.status === 201)
  const ev2 = await call(`/reservations/${resYounes.id}/evaluer`, { method: 'POST', token: younes, body: { note: 3 } })
  check('RG15 evaluation deja deposee refusee', ev2.status === 409)
  const profilH = await call(`/auth/profils/${(await call('/auth/me', { token: hajar })).data.user.id}`, { token: younes })
  check('Note moyenne consultable', profilH.data.profil.note_moyenne === 5 && profilH.data.evaluations.length === 1)

  // Litige du seed (Hajar vs Salima, anglais)
  const litiges = (await call('/admin/litiges', { token: admin })).data.litiges
  const lit = litiges.find((l) => l.statut === 'ouvert')
  check('Litige ouvert avec elements des deux parties', lit && lit.elements.length === 2)
  const nonAdmin = await call('/admin/litiges', { token: younes })
  check('Droits : litiges reserves a l admin (403)', nonAdmin.status === 403)
  const litTiers = await call(`/reservations/${lit.reservation_id}`, { token: younes })
  check('RG19 elements du litige inaccessibles a un tiers', litTiers.status === 403)
  const confLit = await call(`/reservations/${lit.reservation_id}/confirmer`, { method: 'POST', token: salima })
  check('RG11 litige ouvert empeche le transfert', confLit.status === 409)
  const sansMotif = await call(`/admin/litiges/${lit.id}/regler`, { method: 'POST', token: admin, body: { decision: 'transfert' } })
  check('RG13 decision non motivee refusee', sansMotif.status === 400)
  const partiel = await call(`/admin/litiges/${lit.id}/regler`, { method: 'POST', token: admin, body: { decision: 'partiel', motif: 'moitié moitié' } })
  check('RG13 reglement partiel exclu', partiel.status === 400)
  const hajarAv = (await call('/credits', { token: hajar })).data
  const reg1 = await call(`/admin/litiges/${lit.id}/regler`, { method: 'POST', token: admin, body: { decision: 'restitution', motif: 'Absence de l’intervenante constatée.' } })
  check('RG13 restitution integrale', reg1.status === 200 && reg1.data.reservation.statut === 'annulee')
  const hajarAp = (await call('/credits', { token: hajar })).data
  check('RG14 credits restitues au beneficiaire', hajarAp.disponible === hajarAv.disponible + 1 && hajarAp.bloque === hajarAv.bloque - 1)
  const reg2 = await call(`/admin/litiges/${lit.id}/regler`, { method: 'POST', token: admin, body: { decision: 'transfert', motif: 'Tentative de second règlement.' } })
  check('RG14 second reglement refuse (409)', reg2.status === 409)

  // Signalement apres le debut sur une seance acceptee passee (cree par la voie normale)
  // Seance de Salima a venir -> signalement avant debut refuse
  const salimaResa = (await call('/reservations?role=envoyees', { token: salima })).data.reservations.find((r) => r.statut === 'acceptee')
  const sigTot = await call(`/reservations/${salimaResa.id}/signaler`, { method: 'POST', token: salima, body: { motif: 'Problème avant le début' } })
  check('Signalement avant le debut refuse', sigTot.status === 409)
  const annApresDebut = await call(`/reservations/${resYounes.id}/annuler`, { method: 'POST', token: younes })
  check('Annulation directe interdite apres debut / statut', annApresDebut.status === 409)

  // RG17 archivage annule les demandes en attente
  const dem5 = await call('/reservations', { method: 'POST', token: nour, body: { creneau_id: c1.data.creneau.id } })
  await call(`/offres/${offreId}`, { method: 'PUT', token: younes, body: { statut: 'archivee' } })
  const apresArch = (await call(`/reservations/${dem5.data.reservation.id}`, { token: nour })).data.reservation
  check('RG17 archivage annule les demandes en attente', apresArch.statut === 'refusee')
  const nouvelle = await call('/reservations', { method: 'POST', token: kaouthar, body: { creneau_id: c1.data.creneau.id } })
  check('RG17 archivage empeche les nouvelles demandes', nouvelle.status === 409)
  // Masquage admin
  const catOffre = (await call('/offres?q=pandas')).data.offres[0]
  const masq = await call(`/admin/offres/${catOffre.id}/masquer`, { method: 'POST', token: admin, body: { motif: 'Contenu inapproprié' } })
  check('Admin masque une offre', masq.status === 200 && masq.data.offre.masquee === true)
  check('Offre masquee absente du catalogue', (await call('/offres?q=pandas')).data.total === 0)
  const masqNonAdmin = await call(`/admin/offres/${catOffre.id}/masquer`, { method: 'POST', token: younes, body: { motif: 'abus' } })
  check('Droits : masquage reserve a l admin (403)', masqNonAdmin.status === 403)

  // Suggestions : Nour cherche SQL
  await call('/auth/profil', { method: 'PUT', token: nour, body: { competences_recherchees: ['SQL'] } })
  const sug = (await call('/suggestions', { token: nour })).data.offres
  check('Suggestions : offres correspondant aux competences recherchees', sug.length >= 1 && sug.every((o) => o.competence === 'SQL'))
  const sugPropre = (await call('/suggestions', { token: salima })).data.offres
  check('Suggestions : jamais ses propres offres', sugPropre.every((o) => o.intervenant_id !== (/**/ undefined)))

  // RG18 desactivation de compte
  const comptes = (await call('/admin/comptes', { token: admin })).data.comptes
  const cibleDesac = comptes.find((c) => c.email === 'kaouthar@campus.ma')
  const desac = await call(`/admin/comptes/${cibleDesac.id}/statut`, { method: 'POST', token: admin, body: { statut: 'desactive' } })
  check('RG18 desactivation du compte', desac.status === 200)
  const loginDesac = await call('/auth/login', { method: 'POST', body: { email: 'kaouthar@campus.ma', password: 'campus123' } })
  check('RG18 compte desactive : connexion refusee (403)', loginDesac.status === 403)
  const tokenDesac = await call('/auth/me', { token: kaouthar })
  check('RG18 compte desactive : jeton existant refuse', tokenDesac.status === 403)

  // Tableau de bord admin
  const synth = (await call('/admin/synthese', { token: admin })).data
  check('Tableau de bord admin complet', ['comptes_actifs', 'offres_publiees', 'seances_acceptees', 'seances_realisees', 'credits_transferes', 'litiges_ouverts'].every((k) => k in synth))

  // Coherence globale RG16 : aucun solde negatif
  const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'))
  const par = {}
  for (const m of db.mouvements) {
    par[m.user_id] ??= { d: 0, b: 0 }
    const q = m.quantite
    if (['bienvenue', 'transfert_recu'].includes(m.type)) par[m.user_id].d += q
    if (m.type === 'blocage') { par[m.user_id].d -= q; par[m.user_id].b += q }
    if (m.type === 'liberation') { par[m.user_id].d += q; par[m.user_id].b -= q }
    if (m.type === 'transfert_emis') par[m.user_id].b -= q
  }
  check('RG16 aucun solde disponible ou bloque negatif', Object.values(par).every((x) => x.d >= 0 && x.b >= 0))
  const bloqueTotal = Object.values(par).reduce((t, x) => t + x.b, 0)
  const bloqueResa = db.reservations.reduce((t, r) => t + (r.credits_bloques || 0), 0)
  check('RG16 credits bloques coherents avec les reservations', bloqueTotal === bloqueResa)
  const totalCredits = Object.values(par).reduce((t, x) => t + x.d + x.b, 0)
  check('Conservation : total = 2 credits x comptes', totalCredits === 2 * db.users.length)
} catch (err) {
  console.error('ERREUR TEST', err)
  ko++
} finally {
  srv.kill()
  fs.rmSync(DATA_DIR, { recursive: true, force: true })
}
console.log(`\n${ok} OK, ${ko} echec(s)`)
process.exit(ko ? 1 : 0)
