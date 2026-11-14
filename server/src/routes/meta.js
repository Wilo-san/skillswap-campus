import { Router } from 'express'
import { get, save, now, portefeuille, nomComplet, publicUser, notifier, noteMoyenne } from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'
import { annulerAcceptee } from './reservations.js'

const router = Router()

router.get('/dashboard', requireAuth, (req, res) => {
  const db = get()
  const me = req.user.id
  const mes = db.reservations.filter((r) => r.beneficiaire_id === me || r.intervenant_id === me)
  const enrichies = mes.map((r) => {
    const c = db.creneaux.find((x) => x.id === r.creneau_id)
    const o = db.offres.find((x) => x.id === r.offre_id)
    return {
      id: r.id,
      statut: r.statut,
      offre_titre: o?.titre || '',
      debut: c?.debut || null,
      fin: c?.fin || null,
      role: r.intervenant_id === me ? 'intervenant' : 'beneficiaire',
      autre_nom: nomComplet(r.intervenant_id === me ? r.beneficiaire_id : r.intervenant_id),
      cout_credits: r.cout_credits,
    }
  })
  const prochaines = enrichies
    .filter((r) => r.statut === 'acceptee' && r.debut && new Date(r.fin) >= new Date())
    .sort((a, b) => new Date(a.debut) - new Date(b.debut))
    .slice(0, 5)
  const wallet = portefeuille(me)
  const note = noteMoyenne(me)
  res.json({
    solde: wallet.disponible,
    bloque: wallet.bloque,
    note_moyenne: note.moyenne,
    nb_evaluations: note.total,
    stats: {
      offres_publiees: db.offres.filter((o) => o.intervenant_id === me && o.statut === 'publiee' && !o.masquee).length,
      demandes_recues: mes.filter((r) => r.intervenant_id === me && r.statut === 'en_attente').length,
      demandes_envoyees: mes.filter((r) => r.beneficiaire_id === me && r.statut === 'en_attente').length,
      a_confirmer: enrichies.filter((r) => {
        const resa = mes.find((x) => x.id === r.id)
        const mien = resa.intervenant_id === me ? resa.confirme_intervenant : resa.confirme_beneficiaire
        return r.statut === 'acceptee' && r.fin && new Date(r.fin) <= new Date() && !mien
      }).length,
      sessions_donnees: mes.filter((r) => r.intervenant_id === me && r.statut === 'realisee').length,
      sessions_recues: mes.filter((r) => r.beneficiaire_id === me && r.statut === 'realisee').length,
      litiges: mes.filter((r) => r.statut === 'en_litige').length,
    },
    prochaines,
    recentes: enrichies.sort((a, b) => new Date(b.debut || 0) - new Date(a.debut || 0)).slice(0, 5),
  })
})

/* --------------------------------- admin -------------------------------- */

router.get('/admin/synthese', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const transferes = db.mouvements.filter((m) => m.type === 'transfert_recu').reduce((t, m) => t + m.quantite, 0)
  res.json({
    comptes_actifs: db.users.filter((u) => (u.statut || 'actif') === 'actif').length,
    comptes_desactives: db.users.filter((u) => u.statut === 'desactive').length,
    offres_publiees: db.offres.filter((o) => o.statut === 'publiee' && !o.masquee).length,
    offres_masquees: db.offres.filter((o) => o.masquee).length,
    seances_acceptees: db.reservations.filter((r) => r.statut === 'acceptee').length,
    seances_realisees: db.reservations.filter((r) => r.statut === 'realisee').length,
    credits_transferes: transferes,
    credits_bloques: db.users.reduce((t, u) => t + portefeuille(u.id).bloque, 0),
    litiges_ouverts: db.litiges.filter((l) => l.statut === 'ouvert').length,
    litiges_regles: db.litiges.filter((l) => l.statut === 'regle').length,
  })
})

router.get('/admin/offres', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const offres = db.offres
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((o) => ({ ...o, intervenant_nom: nomComplet(o.intervenant_id) }))
  res.json({ offres })
})

// RG17 : masquer une offre empeche les nouvelles demandes et annule les demandes en attente
router.post('/admin/offres/:id/masquer', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const offre = db.offres.find((o) => o.id === req.params.id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })
  const masquer = req.body?.masquer !== false
  if (masquer) {
    const motif = String(req.body?.motif || '').trim()
    if (motif.length < 5) return res.status(400).json({ error: 'Indiquez le motif du masquage.' })
    offre.masquee = true
    offre.motif_masquage = motif.slice(0, 300)
    db.reservations
      .filter((r) => r.offre_id === offre.id && r.statut === 'en_attente')
      .forEach((r) => {
        r.statut = 'refusee'
        r.motif_refus = "L'offre a été masquée par un administrateur."
        r.updated_at = now()
        notifier(r.beneficiaire_id, `Votre demande « ${offre.titre} » a été annulée : offre masquée.`, '/reservations')
      })
    notifier(offre.intervenant_id, `Votre offre « ${offre.titre} » a été masquée : ${offre.motif_masquage}`, '/mes-offres')
  } else {
    offre.masquee = false
    offre.motif_masquage = ''
    notifier(offre.intervenant_id, `Votre offre « ${offre.titre} » est de nouveau visible.`, '/mes-offres')
  }
  save()
  res.json({ offre })
})

router.get('/admin/comptes', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const comptes = db.users.map((u) => {
    const pub = publicUser(u)
    const acceptees = db.reservations.filter(
      (r) => r.statut === 'acceptee' && (r.intervenant_id === u.id || r.beneficiaire_id === u.id),
    ).length
    return { ...pub, created_at: u.created_at, seances_acceptees: acceptees }
  })
  res.json({ comptes })
})

// RG18 : activer / desactiver un compte
router.post('/admin/comptes/:id/statut', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const user = db.users.find((u) => u.id === req.params.id)
  if (!user) return res.status(404).json({ error: 'Compte introuvable.' })
  const statut = req.body?.statut
  if (!['actif', 'desactive'].includes(statut)) return res.status(400).json({ error: 'Statut invalide.' })
  if (user.id === req.user.id && statut === 'desactive') {
    return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' })
  }
  user.statut = statut
  if (statut === 'desactive') {
    // les demandes en attente sont annulees ; les reservations acceptees restent a traiter par l'admin
    db.reservations
      .filter((r) => r.statut === 'en_attente' && (r.beneficiaire_id === user.id || r.intervenant_id === user.id))
      .forEach((r) => {
        r.statut = 'annulee'
        r.motif_refus = 'Compte désactivé.'
        r.updated_at = now()
        const autre = r.beneficiaire_id === user.id ? r.intervenant_id : r.beneficiaire_id
        notifier(autre, 'Une demande a été annulée : compte désactivé.', '/reservations')
      })
  }
  save()
  const restantes = db.reservations.filter(
    (r) => ['acceptee', 'en_litige'].includes(r.statut) && (r.beneficiaire_id === user.id || r.intervenant_id === user.id),
  ).length
  res.json({ compte: publicUser(user), reservations_a_traiter: restantes })
})

// RG18 : traitement admin d'une reservation acceptee (annulation avec liberation des credits bloques)
router.post('/admin/reservations/:id/annuler', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  if (resa.statut !== 'acceptee') {
    return res.status(409).json({ error: 'Seule une réservation acceptée peut être annulée ici (utilisez le règlement pour un litige).' })
  }
  const motif = String(req.body?.motif || '').trim()
  if (motif.length < 5) return res.status(400).json({ error: "Indiquez le motif de l'annulation." })
  annulerAcceptee(resa, `Annulée par l'administrateur : ${motif}`.slice(0, 300), req.user.id)
  save()
  res.json({ ok: true })
})

router.get('/admin/reservations-a-traiter', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const liste = db.reservations
    .filter((r) => {
      if (r.statut !== 'acceptee') return false
      const u1 = db.users.find((u) => u.id === r.intervenant_id)
      const u2 = db.users.find((u) => u.id === r.beneficiaire_id)
      return u1?.statut === 'desactive' || u2?.statut === 'desactive'
    })
    .map((r) => {
      const o = db.offres.find((x) => x.id === r.offre_id)
      const c = db.creneaux.find((x) => x.id === r.creneau_id)
      return {
        id: r.id,
        offre_titre: o?.titre,
        debut: c?.debut,
        intervenant_nom: nomComplet(r.intervenant_id),
        beneficiaire_nom: nomComplet(r.beneficiaire_id),
        credits_bloques: r.credits_bloques,
      }
    })
  res.json({ reservations: liste })
})

export default router
