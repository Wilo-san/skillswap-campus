import { Router } from 'express'
import { get, solde } from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'

const router = Router()

router.get('/dashboard', requireAuth, (req, res) => {
  const db = get()
  const me = req.user.id
  const maintenant = Date.now()

  const mesReservations = db.reservations.filter(
    (r) => r.beneficiaire_id === me || r.intervenant_id === me,
  )
  const prochaines = mesReservations
    .filter((r) => r.statut === 'confirmee' && new Date(r.debut).getTime() >= maintenant)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut))
    .slice(0, 5)
    .map((r) => ({ ...r, role: r.intervenant_id === me ? 'intervenant' : 'beneficiaire' }))

  const demandesRecues = mesReservations.filter(
    (r) => r.intervenant_id === me && r.statut === 'en_attente',
  ).length
  const demandesEnvoyees = mesReservations.filter(
    (r) => r.beneficiaire_id === me && r.statut === 'en_attente',
  ).length
  const sessionsDonnees = mesReservations.filter(
    (r) => r.intervenant_id === me && r.statut === 'confirmee',
  ).length
  const sessionsRecues = mesReservations.filter(
    (r) => r.beneficiaire_id === me && r.statut === 'confirmee',
  ).length

  res.json({
    solde: solde(me),
    stats: {
      offres_publiees: db.offres.filter((o) => o.intervenant_id === me && o.statut === 'publiee').length,
      sessions_donnees: sessionsDonnees,
      sessions_recues: sessionsRecues,
      demandes_recues: demandesRecues,
      demandes_envoyees: demandesEnvoyees,
      litiges: mesReservations.filter((r) => r.statut === 'litige').length,
    },
    prochaines,
    activite: mesReservations
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6),
  })
})

router.get('/admin/synthese', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  res.json({
    utilisateurs: db.users.length,
    offres: db.offres.length,
    offres_publiees: db.offres.filter((o) => o.statut === 'publiee').length,
    reservations: db.reservations.length,
    litiges: db.reservations.filter((r) => r.statut === 'litige').length,
    credits_en_circulation: db.users.reduce((total, u) => total + solde(u.id), 0),
  })
})

router.get('/admin/offres', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  res.json({
    offres: db.offres
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((o) => ({
        ...o,
        reservations: db.reservations.filter((r) => r.offre_id === o.id).length,
      })),
  })
})

router.get('/admin/litiges', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  res.json({
    litiges: db.reservations
      .filter((r) => ['litige', 'litige_resolu'].includes(r.statut))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  })
})

export default router
