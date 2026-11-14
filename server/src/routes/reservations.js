import { Router } from 'express'
import { get, save, uid, now, nomComplet, solde, mouvement } from '../db.js'
import { requireAuth } from '../auth.js'

const router = Router()

const ACTIFS = ['en_attente', 'confirmee', 'litige']

function hydrate(reservation) {
  const db = get()
  const offre = db.offres.find((o) => o.id === reservation.offre_id)
  return {
    ...reservation,
    offre: offre ? { id: offre.id, titre: offre.titre, categorie: offre.categorie, mode: offre.mode } : null,
  }
}

router.get('/reservations', requireAuth, (req, res) => {
  const db = get()
  const role = req.query.role || 'tous'
  let list = db.reservations.filter(
    (r) => r.beneficiaire_id === req.user.id || r.intervenant_id === req.user.id,
  )
  if (role === 'envoyees') list = list.filter((r) => r.beneficiaire_id === req.user.id)
  if (role === 'recues') list = list.filter((r) => r.intervenant_id === req.user.id)

  list = list
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(hydrate)

  res.json({ reservations: list })
})

router.post('/reservations', requireAuth, (req, res) => {
  const db = get()
  const { offre_id, creneau_id, message } = req.body || {}
  const offre = db.offres.find((o) => o.id === offre_id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  if (offre.statut !== 'publiee') return res.status(409).json({ error: "Cette offre n'est pas disponible." })
  if (offre.intervenant_id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas reserver votre propre offre.' })
  }
  const creneau = db.creneaux.find((c) => c.id === creneau_id && c.offre_id === offre.id)
  if (!creneau) return res.status(404).json({ error: "Choisissez un creneau valide pour cette offre." })
  if (creneau.statut !== 'libre') return res.status(409).json({ error: 'Ce creneau est deja pris.' })
  if (new Date(creneau.debut) < new Date()) {
    return res.status(400).json({ error: 'Ce creneau est deja passe.' })
  }

  const monSolde = solde(req.user.id)
  if (monSolde < offre.cout_credits) {
    return res.status(400).json({
      error: `Solde insuffisant : ${offre.cout_credits} credits requis, vous en avez ${monSolde}.`,
    })
  }

  const reservation = {
    id: uid(),
    offre_id: offre.id,
    creneau_id: creneau.id,
    offre_titre: offre.titre,
    beneficiaire_id: req.user.id,
    beneficiaire_nom: nomComplet(req.user.id),
    intervenant_id: offre.intervenant_id,
    intervenant_nom: offre.intervenant_nom,
    cout: offre.cout_credits,
    debut: creneau.debut,
    fin: creneau.fin,
    lieu: creneau.lieu,
    message: String(message || '').trim().slice(0, 500),
    motif: '',
    resolution: '',
    solde_beneficiaire: monSolde,
    confirme_beneficiaire: true,
    confirme_intervenant: false,
    statut: 'en_attente',
    created_at: now(),
  }
  db.reservations.push(reservation)
  creneau.statut = 'demande'
  save()
  res.status(201).json({ reservation: hydrate(reservation) })
})

function findReservation(req, res) {
  const reservation = get().reservations.find((r) => r.id === req.params.id)
  if (!reservation) {
    res.status(404).json({ error: 'Reservation introuvable.' })
    return null
  }
  const isBenef = reservation.beneficiaire_id === req.user.id
  const isInter = reservation.intervenant_id === req.user.id
  if (!isBenef && !isInter && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Acces non autorise a cette reservation.' })
    return null
  }
  return reservation
}

function finaliser(reservation) {
  const db = get()
  reservation.statut = 'confirmee'
  reservation.confirme_intervenant = true
  reservation.confirme_beneficiaire = true
  const creneau = db.creneaux.find((c) => c.id === reservation.creneau_id)
  if (creneau) creneau.statut = 'reserve'

  mouvement({
    user_id: reservation.beneficiaire_id,
    reservation_id: reservation.id,
    type: 'debit',
    quantite: -reservation.cout,
    description: `Session « ${reservation.offre_titre} » avec ${reservation.intervenant_nom}`,
  })
  mouvement({
    user_id: reservation.intervenant_id,
    reservation_id: reservation.id,
    type: 'credit',
    quantite: reservation.cout,
    description: `Session « ${reservation.offre_titre} » pour ${reservation.beneficiaire_nom}`,
  })
}

function libererCreneau(reservation) {
  const creneau = get().creneaux.find((c) => c.id === reservation.creneau_id)
  if (creneau && creneau.statut !== 'reserve') creneau.statut = 'libre'
}

router.post('/reservations/:id/confirmer', requireAuth, (req, res) => {
  const reservation = findReservation(req, res)
  if (!reservation) return
  if (!['en_attente'].includes(reservation.statut)) {
    return res.status(409).json({ error: 'Cette reservation ne peut plus etre confirmee.' })
  }
  const isBenef = reservation.beneficiaire_id === req.user.id
  const isInter = reservation.intervenant_id === req.user.id

  if (isBenef) {
    reservation.confirme_beneficiaire = true
    if (reservation.confirme_intervenant) finaliser(reservation)
  } else if (isInter) {
    if (solde(reservation.beneficiaire_id) < reservation.cout) {
      return res.status(400).json({ error: 'Le beneficiaire n a plus assez de credits pour cette session.' })
    }
    finaliser(reservation)
  } else {
    return res.status(403).json({ error: 'Seuls les participants peuvent confirmer.' })
  }
  save()
  res.json({ reservation: hydrate(reservation) })
})

router.post('/reservations/:id/annuler', requireAuth, (req, res) => {
  const reservation = findReservation(req, res)
  if (!reservation) return
  if (!ACTIFS.includes(reservation.statut)) {
    return res.status(409).json({ error: 'Cette reservation est deja cloturee.' })
  }
  if (reservation.beneficiaire_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Seul le beneficiaire peut annuler sa demande.' })
  }
  if (reservation.statut === 'confirmee') {
    mouvement({
      user_id: reservation.beneficiaire_id,
      reservation_id: reservation.id,
      type: 'remboursement',
      quantite: reservation.cout,
      description: `Annulation de « ${reservation.offre_titre} »`,
    })
    mouvement({
      user_id: reservation.intervenant_id,
      reservation_id: reservation.id,
      type: 'remboursement',
      quantite: -reservation.cout,
      description: `Annulation de « ${reservation.offre_titre} »`,
    })
  }
  reservation.statut = 'annulee'
  libererCreneau(reservation)
  save()
  res.json({ reservation: hydrate(reservation) })
})

router.post('/reservations/:id/refuser', requireAuth, (req, res) => {
  const reservation = findReservation(req, res)
  if (!reservation) return
  if (reservation.intervenant_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Seul l'intervenant peut refuser." })
  }
  if (!['en_attente', 'confirmee'].includes(reservation.statut)) {
    return res.status(409).json({ error: 'Cette reservation ne peut plus etre refusee.' })
  }
  if (reservation.statut === 'confirmee') {
    mouvement({
      user_id: reservation.beneficiaire_id,
      reservation_id: reservation.id,
      type: 'remboursement',
      quantite: reservation.cout,
      description: `Remboursement « ${reservation.offre_titre} »`,
    })
    mouvement({
      user_id: reservation.intervenant_id,
      reservation_id: reservation.id,
      type: 'remboursement',
      quantite: -reservation.cout,
      description: `Remboursement « ${reservation.offre_titre} »`,
    })
  }
  reservation.motif = String(req.body?.motif || '').trim()
  reservation.statut = 'refusee'
  libererCreneau(reservation)
  save()
  res.json({ reservation: hydrate(reservation) })
})

router.post('/reservations/:id/litige', requireAuth, (req, res) => {
  const reservation = findReservation(req, res)
  if (!reservation) return
  if (reservation.statut !== 'confirmee') {
    return res.status(409).json({ error: 'Seule une session confirmee peut faire l objet d un litige.' })
  }
  const motif = String(req.body?.motif || '').trim()
  if (motif.length < 10) {
    return res.status(400).json({ error: 'Decrivez le probleme en au moins 10 caracteres.' })
  }
  reservation.statut = 'litige'
  reservation.motif = motif
  save()
  res.json({ reservation: hydrate(reservation) })
})

router.post('/reservations/:id/resoudre', requireAuth, (req, res) => {
  const reservation = findReservation(req, res)
  if (!reservation) return
  if (reservation.statut !== 'litige') {
    return res.status(409).json({ error: 'Cette reservation n est pas en litige.' })
  }
  const { resolution, rembourser } = req.body || {}
  if (reservation.intervenant_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Seul l intervenant ou un administrateur peut resoudre le litige.' })
  }
  if (rembourser) {
    mouvement({
      user_id: reservation.beneficiaire_id,
      reservation_id: reservation.id,
      type: 'remboursement',
      quantite: reservation.cout,
      description: `Litige resolu « ${reservation.offre_titre} »`,
    })
    mouvement({
      user_id: reservation.intervenant_id,
      reservation_id: reservation.id,
      type: 'remboursement',
      quantite: -reservation.cout,
      description: `Litige resolu « ${reservation.offre_titre} »`,
    })
  }
  reservation.resolution = String(resolution || 'Litige traite.').trim()
  reservation.statut = 'litige_resolu'
  libererCreneau(reservation)
  save()
  res.json({ reservation: hydrate(reservation) })
})

export default router
