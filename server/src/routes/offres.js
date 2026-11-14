import { Router } from 'express'
import { get, save, uid, now, nomComplet, solde } from '../db.js'
import { requireAuth, requireAdmin, userFromRequest } from '../auth.js'

const router = Router()

router.get('/categories', (req, res) => {
  const db = get()
  const categories = db.categories.map((c) => ({
    ...c,
    offres: db.offres.filter((o) => o.categorie === c.nom && o.statut === 'publiee').length,
  }))
  res.json({ categories })
})

router.post('/categories', requireAuth, requireAdmin, (req, res) => {
  const nom = String(req.body?.nom || '').trim()
  const description = String(req.body?.description || '').trim()
  if (!nom) return res.status(400).json({ error: 'Le nom de la categorie est obligatoire.' })
  const db = get()
  if (db.categories.some((c) => c.nom.toLowerCase() === nom.toLowerCase())) {
    return res.status(409).json({ error: 'Cette categorie existe deja.' })
  }
  const categorie = { id: uid(), nom, description, created_at: now() }
  db.categories.push(categorie)
  save()
  res.status(201).json({ categorie })
})

router.delete('/categories/:id', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const categorie = db.categories.find((c) => c.id === req.params.id)
  if (!categorie) return res.status(404).json({ error: 'Categorie introuvable.' })
  const utilisee = db.offres.some((o) => o.categorie === categorie.nom)
  if (utilisee) {
    return res.status(409).json({ error: 'Impossible de supprimer une categorie utilisee par des offres.' })
  }
  db.categories = db.categories.filter((c) => c.id !== categorie.id)
  save()
  res.json({ ok: true })
})

function decorate(offre) {
  const db = get()
  const creneaux = db.creneaux
    .filter((c) => c.offre_id === offre.id)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut))
  return {
    ...offre,
    creneaux,
    creneaux_libres: creneaux.filter((c) => c.statut === 'libre').length,
    reservations: db.reservations.filter(
      (r) => r.offre_id === offre.id && ['en_attente', 'confirmee'].includes(r.statut),
    ).length,
  }
}

router.get('/offres', (req, res) => {
  const db = get()
  const { q, categorie, niveau, mode, filiere, statut, intervenant } = req.query
  const user = userFromRequest(req)
  let offres = db.offres.slice()

  if (intervenant === 'me') {
    if (!user) return res.json({ offres: [], total: 0 })
    offres = offres.filter((o) => o.intervenant_id === user.id)
  }
  if (!statut || statut === 'publiee') {
    offres = offres.filter((o) => (statut === 'tous' ? true : o.statut === 'publiee'))
  } else if (statut !== 'tous') {
    offres = offres.filter((o) => o.statut === statut)
  }
  if (categorie) offres = offres.filter((o) => o.categorie === categorie)
  if (niveau) offres = offres.filter((o) => o.niveau === niveau)
  if (mode) offres = offres.filter((o) => o.mode === mode)
  if (filiere) offres = offres.filter((o) => (o.filiere_intervenant || '').toLowerCase() === String(filiere).toLowerCase())
  if (q) {
    const needle = String(q).toLowerCase()
    offres = offres.filter((o) =>
      [o.titre, o.competence, o.description, o.categorie, o.intervenant_nom, o.filiere_intervenant]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }

  offres.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  res.json({ offres: offres.map(decorate), total: offres.length })
})

router.get('/offres/:id', (req, res) => {
  const offre = get().offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  res.json({ offre: decorate(offre) })
})

router.post('/offres', requireAuth, (req, res) => {
  const db = get()
  const body = req.body || {}
  const titre = String(body.titre || '').trim()
  const competence = String(body.competence || '').trim()
  if (!titre || !competence) {
    return res.status(400).json({ error: 'Le titre et la competence sont obligatoires.' })
  }
  const cout = Math.min(5, Math.max(1, Number(body.cout_credits) || 1))
  const profil = db.profils.find((p) => p.user_id === req.user.id)

  const offre = {
    id: uid(),
    titre,
    categorie: String(body.categorie || 'Autre').trim(),
    competence,
    description: String(body.description || '').trim(),
    niveau: ['debutant', 'intermediaire', 'avance'].includes(body.niveau) ? body.niveau : 'intermediaire',
    duree: String(body.duree || '1h').trim(),
    mode: ['presentiel', 'en_ligne'].includes(body.mode) ? body.mode : 'presentiel',
    cout_credits: cout,
    statut: 'publiee',
    intervenant_id: req.user.id,
    intervenant_nom: nomComplet(req.user.id),
    filiere_intervenant: profil?.filiere || '',
    created_at: now(),
  }
  db.offres.push(offre)
  save()
  res.status(201).json({ offre: decorate(offre) })
})

router.put('/offres/:id', requireAuth, (req, res) => {
  const db = get()
  const offre = db.offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  if (offre.intervenant_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres offres." })
  }
  const b = req.body || {}
  const champs = ['titre', 'categorie', 'competence', 'description', 'duree']
  champs.forEach((champ) => {
    if (b[champ] !== undefined) offre[champ] = String(b[champ]).trim()
  })
  if (b.niveau && ['debutant', 'intermediaire', 'avance'].includes(b.niveau)) offre.niveau = b.niveau
  if (b.mode && ['presentiel', 'en_ligne'].includes(b.mode)) offre.mode = b.mode
  if (b.cout_credits !== undefined) offre.cout_credits = Math.min(5, Math.max(1, Number(b.cout_credits) || 1))
  if (b.statut && ['publiee', 'archivee', 'suspendue'].includes(b.statut)) offre.statut = b.statut
  offre.updated_at = now()
  save()
  res.json({ offre: decorate(offre) })
})

router.delete('/offres/:id', requireAuth, (req, res) => {
  const db = get()
  const offre = db.offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  if (offre.intervenant_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Vous ne pouvez supprimer que vos propres offres." })
  }
  const actives = db.reservations.filter(
    (r) => r.offre_id === offre.id && ['en_attente', 'confirmee'].includes(r.statut),
  )
  if (actives.length) {
    return res.status(409).json({ error: 'Des reservations sont en cours sur cette offre : archivez-la plutot.' })
  }
  db.offres = db.offres.filter((o) => o.id !== offre.id)
  db.creneaux = db.creneaux.filter((c) => c.offre_id !== offre.id)
  save()
  res.json({ ok: true })
})

router.post('/offres/:id/creneaux', requireAuth, (req, res) => {
  const db = get()
  const offre = db.offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  if (offre.intervenant_id !== req.user.id) {
    return res.status(403).json({ error: 'Vous ne pouvez gerer que les creneaux de vos offres.' })
  }
  const { debut, fin, lieu } = req.body || {}
  if (!debut || !fin) return res.status(400).json({ error: 'Date de debut et de fin obligatoires.' })
  if (new Date(fin) <= new Date(debut)) {
    return res.status(400).json({ error: 'La fin doit etre posterieure au debut.' })
  }
  const creneau = {
    id: uid(),
    offre_id: offre.id,
    intervenant_id: req.user.id,
    debut: new Date(debut).toISOString(),
    fin: new Date(fin).toISOString(),
    lieu: String(lieu || (offre.mode === 'en_ligne' ? 'Visio (lien envoye apres confirmation)' : 'Campus')).trim(),
    statut: 'libre',
    created_at: now(),
  }
  db.creneaux.push(creneau)
  save()
  res.status(201).json({ creneau })
})

router.delete('/creneaux/:id', requireAuth, (req, res) => {
  const db = get()
  const creneau = db.creneaux.find((c) => c.id === req.params.id)
  if (!creneau) return res.status(404).json({ error: 'Creneau introuvable.' })
  if (creneau.intervenant_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Suppression non autorisee.' })
  }
  if (creneau.statut === 'reserve') {
    return res.status(409).json({ error: 'Ce creneau est deja reserve.' })
  }
  db.creneaux = db.creneaux.filter((c) => c.id !== creneau.id)
  save()
  res.json({ ok: true })
})

router.get('/credits', requireAuth, (req, res) => {
  const mouvements = get()
    .mouvements.filter((m) => m.user_id === req.user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  res.json({ solde: solde(req.user.id), mouvements })
})

export default router
