import { Router } from 'express'
import { get, save, uid, now, nomComplet, portefeuille, estActif, notifier, noteMoyenne } from '../db.js'
import { requireAuth, requireAdmin, userFromRequest } from '../auth.js'

const router = Router()
const NIVEAUX = ['debutant', 'intermediaire', 'avance']
const MODES = ['presentiel', 'distance']
const STATUTS_OFFRE = ['brouillon', 'publiee', 'archivee']

/* ------------------------------ categories ------------------------------ */

router.get('/categories', (req, res) => {
  const db = get()
  const categories = db.categories.map((c) => ({
    ...c,
    offres: db.offres.filter((o) => o.categorie === c.nom && o.statut === 'publiee' && !o.masquee).length,
  }))
  res.json({ categories })
})

router.post('/categories', requireAuth, requireAdmin, (req, res) => {
  const nom = String(req.body?.nom || '').trim()
  const description = String(req.body?.description || '').trim()
  if (!nom) return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire.' })
  const db = get()
  if (db.categories.some((c) => c.nom.toLowerCase() === nom.toLowerCase())) {
    return res.status(409).json({ error: 'Cette catégorie existe déjà.' })
  }
  const categorie = { id: uid(), nom, description, created_at: now() }
  db.categories.push(categorie)
  save()
  res.status(201).json({ categorie })
})

router.put('/categories/:id', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const categorie = db.categories.find((c) => c.id === req.params.id)
  if (!categorie) return res.status(404).json({ error: 'Catégorie introuvable.' })
  const nom = String(req.body?.nom ?? categorie.nom).trim()
  if (!nom) return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire.' })
  if (db.categories.some((c) => c.id !== categorie.id && c.nom.toLowerCase() === nom.toLowerCase())) {
    return res.status(409).json({ error: 'Cette catégorie existe déjà.' })
  }
  if (nom !== categorie.nom) {
    db.offres.forEach((o) => {
      if (o.categorie === categorie.nom) o.categorie = nom
    })
    categorie.nom = nom
  }
  if (req.body?.description !== undefined) categorie.description = String(req.body.description).trim()
  save()
  res.json({ categorie })
})

router.delete('/categories/:id', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const categorie = db.categories.find((c) => c.id === req.params.id)
  if (!categorie) return res.status(404).json({ error: 'Catégorie introuvable.' })
  if (db.offres.some((o) => o.categorie === categorie.nom)) {
    return res.status(409).json({ error: 'Impossible de supprimer une catégorie utilisée par des offres.' })
  }
  db.categories = db.categories.filter((c) => c.id !== categorie.id)
  save()
  res.json({ ok: true })
})

/* -------------------------------- offres -------------------------------- */

const futur = (c) => new Date(c.debut) > new Date()

// RG19 : le lieu precis / lien prive n'est visible que par les participants (et l'admin)
function creneauVisible(c, user, offre) {
  const db = get()
  const participant =
    user &&
    (user.role === 'admin' ||
      offre.intervenant_id === user.id ||
      db.reservations.some(
        (r) =>
          r.creneau_id === c.id &&
          ['acceptee', 'realisee', 'en_litige'].includes(r.statut) &&
          (r.beneficiaire_id === user.id || r.intervenant_id === user.id),
      ))
  const { lieu, ...reste } = c
  return participant ? { ...reste, lieu } : { ...reste, lieu: null, lieu_masque: true }
}

function decorate(offre, user = null, { detail = false } = {}) {
  const db = get()
  const tous = db.creneaux
    .filter((c) => c.offre_id === offre.id)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut))
  const libres = tous.filter((c) => c.statut === 'libre' && futur(c))
  const note = noteMoyenne(offre.intervenant_id)
  const demandes = db.reservations.filter((r) => r.offre_id === offre.id)
  return {
    ...offre,
    intervenant_nom: nomComplet(offre.intervenant_id),
    filiere_intervenant: db.profils.find((p) => p.user_id === offre.intervenant_id)?.filiere || '',
    intervenant_note: note.moyenne,
    intervenant_nb_notes: note.total,
    creneaux: (detail ? tous : tous.filter((c) => c.statut !== 'annule')).map((c) => creneauVisible(c, user, offre)),
    creneaux_libres: libres.length,
    prochain_creneau: libres[0]?.debut || null,
    reservations: demandes.filter((r) => ['en_attente', 'acceptee'].includes(r.statut)).length,
  }
}

function correspondDate(offre, date) {
  const jour = String(date).slice(0, 10)
  return get().creneaux.some(
    (c) => c.offre_id === offre.id && c.statut === 'libre' && futur(c) && c.debut.slice(0, 10) === jour,
  )
}

router.get('/offres', (req, res) => {
  const db = get()
  const { q, categorie, niveau, mode, date, statut, intervenant } = req.query
  const user = userFromRequest(req)
  let offres = db.offres.slice()

  if (intervenant === 'me') {
    if (!user) return res.json({ offres: [], total: 0 })
    offres = offres.filter((o) => o.intervenant_id === user.id)
    if (statut && statut !== 'tous') offres = offres.filter((o) => o.statut === statut)
  } else {
    // Catalogue public : seulement les offres publiees, non masquees, d'intervenants actifs,
    // avec au moins un creneau futur libre.
    offres = offres.filter(
      (o) =>
        o.statut === 'publiee' &&
        !o.masquee &&
        estActif(o.intervenant_id) &&
        db.creneaux.some((c) => c.offre_id === o.id && c.statut === 'libre' && futur(c)),
    )
  }
  if (categorie) offres = offres.filter((o) => o.categorie === categorie)
  if (niveau) offres = offres.filter((o) => o.niveau === niveau)
  if (mode) offres = offres.filter((o) => o.mode === mode)
  if (date) offres = offres.filter((o) => correspondDate(o, date))
  if (q) {
    const needle = String(q).toLowerCase()
    offres = offres.filter((o) =>
      [o.titre, o.competence, o.description, o.categorie, nomComplet(o.intervenant_id)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }

  offres.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  res.json({ offres: offres.map((o) => decorate(o, user)), total: offres.length })
})

// Suggestions : offres publiees d'autres etudiants, avec un creneau futur libre, dont la competence
// ou la categorie correspond aux competences recherchees du profil.
router.get('/suggestions', requireAuth, (req, res) => {
  const db = get()
  const profil = db.profils.find((p) => p.user_id === req.user.id)
  const recherchees = (profil?.competences_recherchees || []).map((c) => c.toLowerCase())
  if (!recherchees.length) return res.json({ offres: [], criteres: [] })
  const correspond = (o) => {
    const comp = o.competence.toLowerCase()
    const cat = o.categorie.toLowerCase()
    const titre = o.titre.toLowerCase()
    return recherchees.some((r) => comp.includes(r) || r.includes(comp) || cat.includes(r) || titre.includes(r))
  }
  const offres = db.offres
    .filter(
      (o) =>
        o.statut === 'publiee' &&
        !o.masquee &&
        o.intervenant_id !== req.user.id &&
        estActif(o.intervenant_id) &&
        correspond(o) &&
        db.creneaux.some((c) => c.offre_id === o.id && c.statut === 'libre' && futur(c)),
    )
    .slice(0, 6)
    .map((o) => decorate(o, req.user))
  res.json({ offres, criteres: profil.competences_recherchees })
})

router.get('/offres/:id', (req, res) => {
  const user = userFromRequest(req)
  const offre = get().offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  const proprietaire = user && (user.id === offre.intervenant_id || user.role === 'admin')
  if (!proprietaire && (offre.statut !== 'publiee' || offre.masquee)) {
    return res.status(404).json({ error: "Cette offre n'est plus disponible." })
  }
  res.json({ offre: decorate(offre, user, { detail: Boolean(proprietaire) }) })
})

function validerOffre(body, existante = null) {
  const erreurs = []
  const titre = String(body.titre ?? existante?.titre ?? '').trim()
  const competence = String(body.competence ?? existante?.competence ?? '').trim()
  const categorie = String(body.categorie ?? existante?.categorie ?? '').trim()
  const description = String(body.description ?? existante?.description ?? '').trim()
  const niveau = body.niveau ?? existante?.niveau
  const mode = body.mode ?? existante?.mode
  const duree = Number(body.duree_heures ?? existante?.duree_heures)

  if (!titre) erreurs.push('Le titre est obligatoire.')
  if (!categorie) erreurs.push('La catégorie est obligatoire.')
  else if (!get().categories.some((c) => c.nom === categorie)) erreurs.push("Cette catégorie n'existe pas.")
  if (!competence) erreurs.push('La compétence est obligatoire.')
  if (!description) erreurs.push('La description est obligatoire.')
  if (!NIVEAUX.includes(niveau)) erreurs.push('Le niveau est invalide.')
  if (!MODES.includes(mode)) erreurs.push('Le mode de déroulement est invalide.')
  if (![1, 2].includes(duree)) erreurs.push('La durée doit être de 1 ou 2 heures.')
  return { erreurs, valeurs: { titre, competence, categorie, description, niveau, mode, duree_heures: duree } }
}

router.post('/offres', requireAuth, (req, res) => {
  const db = get()
  const { erreurs, valeurs } = validerOffre(req.body || {})
  if (erreurs.length) return res.status(400).json({ error: erreurs.join(' ') })
  const statut = req.body?.statut === 'publiee' ? 'publiee' : 'brouillon'
  const offre = {
    id: uid(),
    ...valeurs,
    cout_credits: valeurs.duree_heures, // RG02 : 1h = 1 credit, 2h = 2 credits
    statut,
    masquee: false,
    motif_masquage: '',
    intervenant_id: req.user.id,
    created_at: now(),
  }
  db.offres.push(offre)
  save()
  res.status(201).json({ offre: decorate(offre, req.user, { detail: true }) })
})

// Annule les demandes en attente d'une offre (RG17)
function annulerDemandesEnAttente(offreId, motif) {
  const db = get()
  db.reservations
    .filter((r) => r.offre_id === offreId && r.statut === 'en_attente')
    .forEach((r) => {
      r.statut = 'refusee'
      r.motif_refus = motif
      r.updated_at = now()
      const c = db.creneaux.find((x) => x.id === r.creneau_id)
      if (c && c.statut === 'demande' && !db.reservations.some((x) => x.creneau_id === c.id && x.statut === 'en_attente' && x.id !== r.id)) {
        c.statut = 'libre'
      }
      notifier(r.beneficiaire_id, `Votre demande a été annulée : ${motif}`, '/reservations')
    })
}

router.put('/offres/:id', requireAuth, (req, res) => {
  const db = get()
  const offre = db.offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  if (offre.intervenant_id !== req.user.id) {
    return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres offres.' })
  }
  const b = req.body || {}

  // RG17 : duree des seances deja acceptees non modifiable
  const acceptees = db.reservations.some(
    (r) => r.offre_id === offre.id && ['acceptee', 'en_litige'].includes(r.statut),
  )
  if (acceptees && b.duree_heures !== undefined && Number(b.duree_heures) !== offre.duree_heures) {
    return res.status(409).json({ error: 'La durée ne peut plus être modifiée : des séances sont déjà acceptées.' })
  }
  const { erreurs, valeurs } = validerOffre(b, offre)
  if (erreurs.length) return res.status(400).json({ error: erreurs.join(' ') })

  const statut = b.statut ?? offre.statut
  if (!STATUTS_OFFRE.includes(statut)) return res.status(400).json({ error: 'Statut invalide.' })
  if (offre.masquee && statut === 'publiee') {
    return res.status(403).json({ error: 'Cette offre a été masquée par un administrateur.' })
  }
  Object.assign(offre, valeurs, { cout_credits: valeurs.duree_heures })
  if (statut !== offre.statut) {
    offre.statut = statut
    if (statut === 'archivee') annulerDemandesEnAttente(offre.id, "L'offre a été archivée par son intervenant.")
  }
  offre.updated_at = now()
  save()
  res.json({ offre: decorate(offre, req.user, { detail: true }) })
})

router.delete('/offres/:id', requireAuth, (req, res) => {
  const db = get()
  const offre = db.offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  if (offre.intervenant_id !== req.user.id) {
    return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres offres.' })
  }
  if (db.reservations.some((r) => r.offre_id === offre.id)) {
    return res.status(409).json({ error: 'Cette offre a un historique de réservations : archivez-la plutôt.' })
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
    return res.status(403).json({ error: 'Vous ne pouvez gérer que les créneaux de vos offres.' })
  }
  const { debut, lieu } = req.body || {}
  if (!debut || Number.isNaN(new Date(debut).getTime())) {
    return res.status(400).json({ error: 'La date et l’heure de début sont obligatoires.' })
  }
  const dDebut = new Date(debut)
  if (dDebut <= new Date()) return res.status(400).json({ error: 'Le créneau doit être dans le futur.' })
  // Heure de fin = debut + duree de l'offre, sauf si une fin valide est fournie
  let dFin = new Date(dDebut.getTime() + offre.duree_heures * 3600 * 1000)
  if (req.body?.fin) {
    const f = new Date(req.body.fin)
    if (Number.isNaN(f.getTime()) || f <= dDebut) {
      return res.status(400).json({ error: 'La fin doit être postérieure au début.' })
    }
    const heures = (f - dDebut) / 3600000
    if (heures !== offre.duree_heures) {
      return res.status(400).json({ error: `Le créneau doit durer exactement ${offre.duree_heures} h (durée de l’offre).` })
    }
    dFin = f
  }
  if (!String(lieu || '').trim()) {
    return res.status(400).json({
      error: offre.mode === 'distance' ? 'Indiquez le lien de réunion.' : 'Indiquez le lieu de la séance.',
    })
  }
  const chevauchement = db.creneaux.some(
    (c) =>
      c.intervenant_id === req.user.id &&
      c.statut !== 'annule' &&
      new Date(c.debut) < dFin &&
      dDebut < new Date(c.fin),
  )
  if (chevauchement) {
    return res.status(409).json({ error: 'Ce créneau chevauche un de vos créneaux existants.' })
  }
  const creneau = {
    id: uid(),
    offre_id: offre.id,
    intervenant_id: req.user.id,
    debut: dDebut.toISOString(),
    fin: dFin.toISOString(),
    lieu: String(lieu).trim().slice(0, 300),
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
  if (!creneau) return res.status(404).json({ error: 'Créneau introuvable.' })
  if (creneau.intervenant_id !== req.user.id) {
    return res.status(403).json({ error: 'Suppression non autorisée.' })
  }
  if (db.reservations.some((r) => r.creneau_id === creneau.id && ['en_attente', 'acceptee', 'en_litige', 'realisee'].includes(r.statut))) {
    return res.status(409).json({ error: 'Ce créneau est lié à une réservation : annulez-la d’abord.' })
  }
  db.creneaux = db.creneaux.filter((c) => c.id !== creneau.id)
  save()
  res.json({ ok: true })
})

/* -------------------------------- credits ------------------------------- */

router.get('/credits', requireAuth, (req, res) => {
  const db = get()
  const mouvements = db.mouvements
    .filter((m) => m.user_id === req.user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((m) => {
      const r = m.reservation_id ? db.reservations.find((x) => x.id === m.reservation_id) : null
      const offre = r ? db.offres.find((o) => o.id === r.offre_id) : null
      return { ...m, seance: offre ? offre.titre : null }
    })
  const wallet = portefeuille(req.user.id)
  res.json({ solde: wallet.disponible, disponible: wallet.disponible, bloque: wallet.bloque, mouvements })
})

/* ---------------------------- notifications ----------------------------- */

router.get('/notifications', requireAuth, (req, res) => {
  const items = get()
    .notifications.filter((n) => n.user_id === req.user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50)
  res.json({ notifications: items, non_lues: items.filter((n) => !n.lue).length })
})

router.post('/notifications/lues', requireAuth, (req, res) => {
  get().notifications.forEach((n) => {
    if (n.user_id === req.user.id) n.lue = true
  })
  save()
  res.json({ ok: true })
})

export default router
