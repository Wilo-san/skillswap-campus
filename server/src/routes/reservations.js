import { Router } from 'express'
import {
  get,
  save,
  uid,
  now,
  nomComplet,
  mouvement,
  portefeuille,
  estActif,
  conflitPlanning,
  notifier,
} from '../db.js'
import { requireAuth, requireAdmin } from '../auth.js'

const router = Router()

/* Toutes les routes ci-dessous sont synchrones : une requete s'execute en entier avant la suivante.
   Les controles d'etat (statut, regle deja appliquee) servent d'idempotence : un double clic ou deux
   requetes simultanees ne peuvent ni attribuer deux fois un creneau (RG07), ni transferer deux fois
   des credits (RG11, RG14). */

const ACTIVES = ['en_attente', 'acceptee', 'en_litige']

function lieuVisible(resa, creneau, user) {
  const participant = user.role === 'admin' || resa.intervenant_id === user.id || resa.beneficiaire_id === user.id
  // RG19 : lieu / lien visible uniquement des participants, une fois la reservation acceptee
  if (participant && ['acceptee', 'realisee', 'en_litige'].includes(resa.statut)) return creneau?.lieu || null
  if (participant && user.id === resa.intervenant_id) return creneau?.lieu || null
  return null
}

function decorate(resa, user) {
  const db = get()
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  const creneau = db.creneaux.find((c) => c.id === resa.creneau_id)
  const litige = db.litiges.find((l) => l.reservation_id === resa.id)
  const estParticipant = resa.intervenant_id === user.id || resa.beneficiaire_id === user.id
  const finPassee = creneau ? new Date(creneau.fin) <= new Date() : false
  const debutPasse = creneau ? new Date(creneau.debut) <= new Date() : false
  const monRole = resa.intervenant_id === user.id ? 'intervenant' : resa.beneficiaire_id === user.id ? 'beneficiaire' : 'admin'
  const maConfirmation = monRole === 'intervenant' ? resa.confirme_intervenant : resa.confirme_beneficiaire
  const autreId = monRole === 'intervenant' ? resa.beneficiaire_id : resa.intervenant_id
  const dejaEvalue = db.evaluations.some((e) => e.reservation_id === resa.id && e.auteur_id === user.id)

  return {
    ...resa,
    offre_titre: offre?.titre || 'Offre supprimée',
    competence: offre?.competence || '',
    mode: offre?.mode || '',
    duree_heures: offre?.duree_heures || 0,
    debut: creneau?.debut || null,
    fin: creneau?.fin || null,
    lieu: lieuVisible(resa, creneau, user),
    intervenant_nom: nomComplet(resa.intervenant_id),
    beneficiaire_nom: nomComplet(resa.beneficiaire_id),
    mon_role: monRole,
    autre_id: autreId,
    fin_passee: finPassee,
    debut_passe: debutPasse,
    ma_confirmation: Boolean(maConfirmation),
    peut_retirer: monRole === 'beneficiaire' && resa.statut === 'en_attente',
    peut_refuser: monRole === 'intervenant' && resa.statut === 'en_attente',
    peut_accepter: monRole === 'intervenant' && resa.statut === 'en_attente',
    peut_annuler: estParticipant && resa.statut === 'acceptee' && !debutPasse,
    peut_confirmer: estParticipant && resa.statut === 'acceptee' && finPassee && !maConfirmation,
    peut_signaler:
      estParticipant && ['acceptee', 'en_litige'].includes(resa.statut) && debutPasse && !(litige && litige.statut === 'ouvert'),
    peut_evaluer: estParticipant && resa.statut === 'realisee' && !dejaEvalue,
    deja_evalue: dejaEvalue,
    litige: litige && (estParticipant || user.role === 'admin') ? litigeDetail(litige) : null,
  }
}

function litigeDetail(l) {
  return {
    ...l,
    ouvert_par_nom: nomComplet(l.ouvert_par),
    elements: (l.elements || []).map((e) => ({ ...e, auteur_nom: nomComplet(e.auteur_id) })),
  }
}

/* ------------------------------ consultation ---------------------------- */

router.get('/reservations', requireAuth, (req, res) => {
  const db = get()
  const { role } = req.query
  let liste = db.reservations.filter(
    (r) => r.beneficiaire_id === req.user.id || r.intervenant_id === req.user.id,
  )
  if (role === 'recues') liste = liste.filter((r) => r.intervenant_id === req.user.id)
  if (role === 'envoyees') liste = liste.filter((r) => r.beneficiaire_id === req.user.id)
  liste.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  res.json({ reservations: liste.map((r) => decorate(r, req.user)) })
})

// Planning personnel : seances acceptees (ou en litige / realisees recentes) triees par date
router.get('/planning', requireAuth, (req, res) => {
  const db = get()
  const seances = db.reservations
    .filter(
      (r) =>
        (r.beneficiaire_id === req.user.id || r.intervenant_id === req.user.id) &&
        ['acceptee', 'en_litige', 'realisee'].includes(r.statut),
    )
    .map((r) => decorate(r, req.user))
    .filter((r) => r.debut)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut))
  res.json({ seances })
})

router.get('/reservations/:id', requireAuth, (req, res) => {
  const resa = get().reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  const ok = req.user.role === 'admin' || resa.beneficiaire_id === req.user.id || resa.intervenant_id === req.user.id
  if (!ok) return res.status(403).json({ error: 'Accès refusé.' })
  res.json({ reservation: decorate(resa, req.user) })
})

/* -------------------------------- demande ------------------------------- */

router.post('/reservations', requireAuth, (req, res) => {
  const db = get()
  const { creneau_id, message } = req.body || {}
  const creneau = db.creneaux.find((c) => c.id === creneau_id)
  if (!creneau) return res.status(404).json({ error: 'Créneau introuvable.' })
  const offre = db.offres.find((o) => o.id === creneau.offre_id)
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' })

  // RG03 : pas sa propre offre
  if (offre.intervenant_id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas réserver votre propre offre.' })
  }
  // RG04 : offre publiee, non masquee, intervenant actif, creneau futur non attribue
  if (offre.statut !== 'publiee' || offre.masquee) {
    return res.status(409).json({ error: "Cette offre n'accepte plus de demandes." })
  }
  if (!estActif(offre.intervenant_id)) {
    return res.status(409).json({ error: "Le compte de l'intervenant est désactivé." })
  }
  if (new Date(creneau.debut) <= new Date()) {
    return res.status(409).json({ error: 'Ce créneau est déjà passé.' })
  }
  if (creneau.statut === 'reserve' || db.reservations.some((r) => r.creneau_id === creneau.id && ['acceptee', 'en_litige', 'realisee'].includes(r.statut))) {
    return res.status(409).json({ error: 'Ce créneau est déjà attribué.' })
  }
  // RG03 : pas de doublon (demande en attente ou acceptee) pour le meme creneau
  if (
    db.reservations.some(
      (r) => r.creneau_id === creneau.id && r.beneficiaire_id === req.user.id && ['en_attente', 'acceptee'].includes(r.statut),
    )
  ) {
    return res.status(409).json({ error: 'Vous avez déjà une demande en cours sur ce créneau.' })
  }
  // RG05 : solde disponible verifie a la demande (aucun credit n'est bloque a ce stade)
  const cout = offre.duree_heures
  if (portefeuille(req.user.id).disponible < cout) {
    return res.status(409).json({
      error: `Solde insuffisant : cette séance coûte ${cout} crédit${cout > 1 ? 's' : ''} et vous en avez ${portefeuille(req.user.id).disponible} de disponible${portefeuille(req.user.id).disponible > 1 ? 's' : ''}.`,
    })
  }

  const resa = {
    id: uid(),
    offre_id: offre.id,
    creneau_id: creneau.id,
    intervenant_id: offre.intervenant_id,
    beneficiaire_id: req.user.id,
    statut: 'en_attente',
    cout_credits: cout,
    credits_bloques: 0,
    message: String(message || '').trim().slice(0, 500),
    motif_refus: '',
    confirme_intervenant: false,
    confirme_beneficiaire: false,
    created_at: now(),
  }
  db.reservations.push(resa)
  notifier(
    offre.intervenant_id,
    `${nomComplet(req.user.id)} demande la séance « ${offre.titre} ».`,
    '/reservations',
  )
  save()
  res.status(201).json({ reservation: decorate(resa, req.user) })
})

/* ------------------------ accepter / refuser / retirer ------------------ */

router.post('/reservations/:id/accepter', requireAuth, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  if (resa.intervenant_id !== req.user.id) {
    return res.status(403).json({ error: "Seul l'intervenant peut accepter cette demande." })
  }
  if (resa.statut !== 'en_attente') {
    return res.status(409).json({ error: 'Cette demande a déjà été traitée.' })
  }
  const creneau = db.creneaux.find((c) => c.id === resa.creneau_id)
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  if (!creneau || !offre) return res.status(404).json({ error: 'Séance introuvable.' })
  if (offre.statut !== 'publiee' || offre.masquee) {
    return res.status(409).json({ error: "L'offre n'est plus publiée." })
  }
  if (!estActif(resa.beneficiaire_id)) {
    return res.status(409).json({ error: 'Le compte du bénéficiaire est désactivé.' })
  }
  if (new Date(creneau.debut) <= new Date()) {
    return res.status(409).json({ error: 'Ce créneau est déjà commencé ou passé.' })
  }
  // RG07 : un seul acceptee par creneau
  if (db.reservations.some((r) => r.id !== resa.id && r.creneau_id === creneau.id && ['acceptee', 'en_litige', 'realisee'].includes(r.statut))) {
    return res.status(409).json({ error: 'Ce créneau est déjà attribué.' })
  }
  // RG05 : second controle du solde a l'acceptation
  const wallet = portefeuille(resa.beneficiaire_id)
  if (wallet.disponible < resa.cout_credits) {
    return res.status(409).json({ error: "Le bénéficiaire n'a plus assez de crédits disponibles." })
  }
  // RG08 : pas de chevauchement (intervenant et beneficiaire)
  if (conflitPlanning(resa.intervenant_id, creneau, resa.id)) {
    return res.status(409).json({ error: 'Conflit de planning : vous avez déjà une séance acceptée sur cet horaire.' })
  }
  if (conflitPlanning(resa.beneficiaire_id, creneau, resa.id)) {
    return res.status(409).json({ error: 'Conflit de planning : le bénéficiaire a déjà une séance acceptée sur cet horaire.' })
  }

  // RG06 : l'acceptation bloque le cout sur le compte du beneficiaire
  mouvement({
    user_id: resa.beneficiaire_id,
    reservation_id: resa.id,
    type: 'blocage',
    quantite: resa.cout_credits,
    description: `Crédits bloqués pour « ${offre.titre} »`,
  })
  resa.statut = 'acceptee'
  resa.credits_bloques = resa.cout_credits
  resa.accepted_at = now()
  creneau.statut = 'reserve'
  notifier(resa.beneficiaire_id, `Votre demande « ${offre.titre} » a été acceptée.`, '/planning')

  // RG07 : les autres demandes en attente sur ce creneau sont refusees automatiquement avec motif
  db.reservations
    .filter((r) => r.id !== resa.id && r.creneau_id === creneau.id && r.statut === 'en_attente')
    .forEach((r) => {
      r.statut = 'refusee'
      r.motif_refus = 'Ce créneau a été attribué à un autre étudiant.'
      r.updated_at = now()
      notifier(r.beneficiaire_id, `Demande refusée automatiquement : ${r.motif_refus}`, '/reservations')
    })
  save()
  res.json({ reservation: decorate(resa, req.user) })
})

router.post('/reservations/:id/refuser', requireAuth, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  if (resa.intervenant_id !== req.user.id) {
    return res.status(403).json({ error: "Seul l'intervenant peut refuser cette demande." })
  }
  if (resa.statut !== 'en_attente') return res.status(409).json({ error: 'Cette demande a déjà été traitée.' })
  const motif = String(req.body?.motif || '').trim()
  if (motif.length < 3) return res.status(400).json({ error: 'Un motif de refus est obligatoire.' })
  resa.statut = 'refusee'
  resa.motif_refus = motif.slice(0, 300)
  resa.updated_at = now()
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  notifier(resa.beneficiaire_id, `Votre demande « ${offre?.titre} » a été refusée : ${resa.motif_refus}`, '/reservations')
  save()
  res.json({ reservation: decorate(resa, req.user) })
})

router.post('/reservations/:id/retirer', requireAuth, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  if (resa.beneficiaire_id !== req.user.id) {
    return res.status(403).json({ error: 'Seul le bénéficiaire peut retirer sa demande.' })
  }
  if (resa.statut !== 'en_attente') {
    return res.status(409).json({ error: 'Seule une demande en attente peut être retirée.' })
  }
  resa.statut = 'annulee'
  resa.motif_refus = 'Demande retirée par le bénéficiaire.'
  resa.updated_at = now()
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  notifier(resa.intervenant_id, `${nomComplet(resa.beneficiaire_id)} a retiré sa demande « ${offre?.titre} ».`, '/reservations')
  save()
  res.json({ reservation: decorate(resa, req.user) })
})

/* -------------------------------- annulation ---------------------------- */

// RG10 : annulation d'une reservation acceptee avant son debut par l'un ou l'autre participant.
export function annulerAcceptee(resa, motif, par) {
  const db = get()
  const creneau = db.creneaux.find((c) => c.id === resa.creneau_id)
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  if (resa.credits_bloques > 0) {
    mouvement({
      user_id: resa.beneficiaire_id,
      reservation_id: resa.id,
      type: 'liberation',
      quantite: resa.credits_bloques,
      description: `Crédits libérés : « ${offre?.titre} » annulée`,
    })
    resa.credits_bloques = 0
  }
  resa.statut = 'annulee'
  resa.motif_refus = motif
  resa.updated_at = now()
  if (creneau) {
    const futurCreneau = new Date(creneau.debut) > new Date()
    creneau.statut = futurCreneau ? 'libre' : 'annule'
  }
  const destinataires = [resa.intervenant_id, resa.beneficiaire_id].filter((id) => id !== par)
  destinataires.forEach((id) => notifier(id, `La séance « ${offre?.titre} » a été annulée : ${motif}`, '/reservations'))
}

router.post('/reservations/:id/annuler', requireAuth, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  if (![resa.intervenant_id, resa.beneficiaire_id].includes(req.user.id)) {
    return res.status(403).json({ error: 'Seuls les participants peuvent annuler.' })
  }
  if (resa.statut !== 'acceptee') {
    return res.status(409).json({ error: 'Seule une séance acceptée peut être annulée.' })
  }
  const creneau = db.creneaux.find((c) => c.id === resa.creneau_id)
  if (creneau && new Date(creneau.debut) <= new Date()) {
    return res.status(409).json({
      error: 'La séance a déjà commencé : l’annulation directe est impossible, utilisez un signalement.',
    })
  }
  const motif = String(req.body?.motif || '').trim() || `Annulée par ${nomComplet(req.user.id)}.`
  annulerAcceptee(resa, motif.slice(0, 300), req.user.id)
  save()
  res.json({ reservation: decorate(resa, req.user) })
})

/* ----------------------- confirmation et transfert ---------------------- */

// RG11 + RG14 : transfert unique des credits bloques vers l'intervenant
export function transferer(resa) {
  const offre = get().offres.find((o) => o.id === resa.offre_id)
  if (resa.credits_bloques <= 0 || resa.regle) return false
  mouvement({
    user_id: resa.beneficiaire_id,
    reservation_id: resa.id,
    type: 'transfert_emis',
    quantite: resa.credits_bloques,
    description: `Séance « ${offre?.titre} » réalisée`,
  })
  mouvement({
    user_id: resa.intervenant_id,
    reservation_id: resa.id,
    type: 'transfert_recu',
    quantite: resa.credits_bloques,
    description: `Séance « ${offre?.titre} » réalisée`,
  })
  resa.credits_bloques = 0
  resa.regle = true
  resa.statut = 'realisee'
  resa.updated_at = now()
  return true
}

router.post('/reservations/:id/confirmer', requireAuth, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  const estIntervenant = resa.intervenant_id === req.user.id
  const estBeneficiaire = resa.beneficiaire_id === req.user.id
  if (!estIntervenant && !estBeneficiaire) {
    return res.status(403).json({ error: 'Seuls les participants peuvent confirmer.' })
  }
  if (resa.statut === 'en_litige') {
    return res.status(409).json({ error: 'Un litige est ouvert : le transfert est suspendu jusqu’à la décision.' })
  }
  if (resa.statut !== 'acceptee') {
    return res.status(409).json({ error: 'Cette séance ne peut pas être confirmée.' })
  }
  const creneau = db.creneaux.find((c) => c.id === resa.creneau_id)
  // RG11 : confirmation uniquement apres l'heure de fin
  if (!creneau || new Date(creneau.fin) > new Date()) {
    return res.status(409).json({ error: "La confirmation n'est possible qu'après la fin de la séance." })
  }
  const champ = estIntervenant ? 'confirme_intervenant' : 'confirme_beneficiaire'
  // RG11 : une seule confirmation par participant
  if (resa[champ]) return res.status(409).json({ error: 'Vous avez déjà confirmé cette séance.' })
  resa[champ] = true
  resa[`${champ}_le`] = now()
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  const autre = estIntervenant ? resa.beneficiaire_id : resa.intervenant_id

  if (resa.confirme_intervenant && resa.confirme_beneficiaire) {
    const litigeOuvert = db.litiges.some((l) => l.reservation_id === resa.id && l.statut === 'ouvert')
    if (!litigeOuvert && transferer(resa)) {
      notifier(resa.intervenant_id, `${resa.cout_credits} crédit(s) reçu(s) pour « ${offre?.titre} ».`, '/credits')
      notifier(resa.beneficiaire_id, `Séance « ${offre?.titre} » réalisée : vous pouvez évaluer l'intervenant.`, '/reservations')
    }
  } else {
    notifier(autre, `${nomComplet(req.user.id)} a confirmé la séance « ${offre?.titre} ». Confirmez à votre tour.`, '/reservations')
  }
  save()
  res.json({ reservation: decorate(resa, req.user) })
})

/* --------------------------------- litiges ------------------------------ */

router.post('/reservations/:id/signaler', requireAuth, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  if (![resa.intervenant_id, resa.beneficiaire_id].includes(req.user.id)) {
    return res.status(403).json({ error: 'Seuls les participants peuvent signaler un problème.' })
  }
  if (resa.regle) return res.status(409).json({ error: 'Cette séance est déjà réglée : aucun second règlement.' })
  if (!['acceptee', 'en_litige'].includes(resa.statut)) {
    return res.status(409).json({ error: 'Aucun signalement possible sur cette réservation.' })
  }
  const creneau = db.creneaux.find((c) => c.id === resa.creneau_id)
  if (creneau && new Date(creneau.debut) > new Date()) {
    return res.status(409).json({ error: 'La séance n’a pas encore commencé : vous pouvez simplement l’annuler.' })
  }
  const type = ['absence', 'desaccord'].includes(req.body?.type) ? req.body.type : 'desaccord'
  const motif = String(req.body?.motif || '').trim()
  if (motif.length < 10) return res.status(400).json({ error: 'Décrivez le problème (10 caractères minimum).' })

  let litige = db.litiges.find((l) => l.reservation_id === resa.id && l.statut === 'ouvert')
  if (!litige) {
    litige = {
      id: uid(),
      reservation_id: resa.id,
      ouvert_par: req.user.id,
      type,
      statut: 'ouvert',
      decision: null,
      motif_decision: '',
      elements: [],
      created_at: now(),
    }
    db.litiges.push(litige)
  }
  // RG13 / RG19 : chaque partie ajoute ses elements, visibles des participants et de l'admin
  litige.elements.push({ id: uid(), auteur_id: req.user.id, type, texte: motif.slice(0, 1000), date: now() })
  resa.statut = 'en_litige'
  resa.updated_at = now()
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  const autre = resa.intervenant_id === req.user.id ? resa.beneficiaire_id : resa.intervenant_id
  notifier(autre, `Un signalement a été ouvert sur « ${offre?.titre} ». Ajoutez votre version.`, '/reservations')
  db.users.filter((u) => u.role === 'admin').forEach((a) => notifier(a.id, `Nouveau litige sur « ${offre?.titre} ».`, '/admin'))
  save()
  res.status(201).json({ reservation: decorate(resa, req.user) })
})

router.get('/admin/litiges', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const litiges = db.litiges
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((l) => {
      const resa = db.reservations.find((r) => r.id === l.reservation_id)
      return { ...litigeDetail(l), reservation: resa ? decorate(resa, req.user) : null }
    })
  res.json({ litiges })
})

router.post('/admin/litiges/:id/regler', requireAuth, requireAdmin, (req, res) => {
  const db = get()
  const litige = db.litiges.find((l) => l.id === req.params.id)
  if (!litige) return res.status(404).json({ error: 'Litige introuvable.' })
  const resa = db.reservations.find((r) => r.id === litige.reservation_id)
  // RG14 : reglement definitif, aucun second reglement
  if (litige.statut !== 'ouvert' || !resa || resa.regle) {
    return res.status(409).json({ error: 'Ce litige est déjà réglé : un règlement est définitif.' })
  }
  const decision = req.body?.decision
  if (!['transfert', 'restitution'].includes(decision)) {
    return res.status(400).json({ error: 'Choisissez un transfert intégral ou une restitution intégrale.' })
  }
  const motif = String(req.body?.motif || '').trim()
  if (motif.length < 10) return res.status(400).json({ error: 'La décision doit être motivée (10 caractères minimum).' })

  const offre = db.offres.find((o) => o.id === resa.offre_id)
  if (decision === 'transfert') {
    transferer(resa) // reservation cloturee comme realisee
  } else {
    if (resa.credits_bloques > 0) {
      mouvement({
        user_id: resa.beneficiaire_id,
        reservation_id: resa.id,
        type: 'liberation',
        quantite: resa.credits_bloques,
        description: `Restitution décidée par l'administrateur : « ${offre?.titre} »`,
      })
      resa.credits_bloques = 0
    }
    resa.statut = 'annulee' // reservation cloturee comme annulee
    resa.regle = true
    resa.updated_at = now()
  }
  litige.statut = 'regle'
  litige.decision = decision
  litige.motif_decision = motif.slice(0, 1000)
  litige.regle_par = req.user.id
  litige.date_reglement = now()
  const texte = decision === 'transfert' ? 'transfert intégral à l’intervenant' : 'restitution intégrale au bénéficiaire'
  ;[resa.intervenant_id, resa.beneficiaire_id].forEach((id) =>
    notifier(id, `Litige « ${offre?.titre} » réglé : ${texte}. ${litige.motif_decision}`, '/reservations'),
  )
  save()
  res.json({ litige: litigeDetail(litige), reservation: decorate(resa, req.user) })
})

/* ------------------------------- evaluations ---------------------------- */

router.post('/reservations/:id/evaluer', requireAuth, (req, res) => {
  const db = get()
  const resa = db.reservations.find((r) => r.id === req.params.id)
  if (!resa) return res.status(404).json({ error: 'Réservation introuvable.' })
  if (![resa.intervenant_id, resa.beneficiaire_id].includes(req.user.id)) {
    return res.status(403).json({ error: 'Seuls les participants peuvent évaluer.' })
  }
  // RG15 : uniquement apres une reservation realisee (pas pour refusee ou annulee)
  if (resa.statut !== 'realisee') {
    return res.status(409).json({ error: "Une évaluation n'est possible qu'après une séance réalisée." })
  }
  // RG15 : une seule evaluation par participant
  if (db.evaluations.some((e) => e.reservation_id === resa.id && e.auteur_id === req.user.id)) {
    return res.status(409).json({ error: 'Vous avez déjà évalué cette séance.' })
  }
  const note = Number(req.body?.note)
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return res.status(400).json({ error: 'La note doit être un entier de 1 à 5.' })
  }
  const cible = resa.intervenant_id === req.user.id ? resa.beneficiaire_id : resa.intervenant_id
  db.evaluations.push({
    id: uid(),
    reservation_id: resa.id,
    auteur_id: req.user.id,
    cible_id: cible,
    note,
    commentaire: String(req.body?.commentaire || '').trim().slice(0, 600),
    date: now(),
  })
  const offre = db.offres.find((o) => o.id === resa.offre_id)
  notifier(cible, `${nomComplet(req.user.id)} vous a noté ${note}/5 pour « ${offre?.titre} ».`, '/profil')
  save()
  res.status(201).json({ reservation: decorate(resa, req.user) })
})

export default router
