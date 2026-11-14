import bcrypt from 'bcryptjs'
import { load, reset, get, save, uid, now, mouvement, CREDITS_BIENVENUE } from './db.js'

const PASSWORD = 'campus123'
const RESET = process.argv.includes('--reset')

// Date relative : jours (negatif = passe) et heure locale
function date(jours, heure = 10) {
  const d = new Date()
  d.setDate(d.getDate() + jours)
  d.setHours(heure, 0, 0, 0)
  return d
}

function creerUtilisateur({ email, prenom, nom, filiere, role = 'etudiant', bio = '', propose = [], recherche = [], statut = 'actif' }) {
  const db = get()
  const user = { id: uid(), email, password_hash: bcrypt.hashSync(PASSWORD, 10), role, statut, created_at: now() }
  db.users.push(user)
  db.profils.push({
    id: uid(),
    user_id: user.id,
    prenom,
    nom,
    filiere,
    bio,
    competences_proposees: propose,
    competences_recherchees: recherche,
    solde_credits: 0,
    credits_bloques: 0,
    created_at: now(),
  })
  mouvement({ user_id: user.id, type: 'bienvenue', quantite: CREDITS_BIENVENUE, description: 'Crédits de bienvenue' })
  return user
}

function creerOffre(intervenant, o) {
  const db = get()
  const offre = {
    id: uid(),
    titre: o.titre,
    categorie: o.categorie,
    competence: o.competence,
    description: o.description,
    niveau: o.niveau,
    duree_heures: o.duree,
    cout_credits: o.duree,
    mode: o.mode,
    statut: o.statut || 'publiee',
    masquee: false,
    motif_masquage: '',
    intervenant_id: intervenant.id,
    created_at: now(),
  }
  db.offres.push(offre)
  return offre
}

function creerCreneau(offre, debut, lieu) {
  const db = get()
  const fin = new Date(debut.getTime() + offre.duree_heures * 3600 * 1000)
  const c = {
    id: uid(),
    offre_id: offre.id,
    intervenant_id: offre.intervenant_id,
    debut: debut.toISOString(),
    fin: fin.toISOString(),
    lieu,
    statut: 'libre',
    created_at: now(),
  }
  db.creneaux.push(c)
  return c
}

function creerReservation({ offre, creneau, beneficiaire, statut, confirmeI = false, confirmeB = false, motifRefus = '' }) {
  const db = get()
  const r = {
    id: uid(),
    offre_id: offre.id,
    creneau_id: creneau.id,
    intervenant_id: offre.intervenant_id,
    beneficiaire_id: beneficiaire.id,
    statut,
    cout_credits: offre.duree_heures,
    credits_bloques: 0,
    message: '',
    motif_refus: motifRefus,
    confirme_intervenant: confirmeI,
    confirme_beneficiaire: confirmeB,
    created_at: now(),
  }
  db.reservations.push(r)
  if (['acceptee', 'en_litige'].includes(statut)) {
    mouvement({ user_id: beneficiaire.id, reservation_id: r.id, type: 'blocage', quantite: r.cout_credits, description: `Crédits bloqués pour « ${offre.titre} »` })
    r.credits_bloques = r.cout_credits
    creneau.statut = 'reserve'
  }
  if (statut === 'realisee') {
    mouvement({ user_id: beneficiaire.id, reservation_id: r.id, type: 'blocage', quantite: r.cout_credits, description: `Crédits bloqués pour « ${offre.titre} »` })
    mouvement({ user_id: beneficiaire.id, reservation_id: r.id, type: 'transfert_emis', quantite: r.cout_credits, description: `Séance « ${offre.titre} » réalisée` })
    mouvement({ user_id: offre.intervenant_id, reservation_id: r.id, type: 'transfert_recu', quantite: r.cout_credits, description: `Séance « ${offre.titre} » réalisée` })
    r.regle = true
    creneau.statut = 'reserve'
  }
  return r
}

export function seed() {
  const db = get()
  if (db.users.length) return false

  const categories = [
    ['Informatique & programmation', 'Langages, algorithmique, développement web et mobile.'],
    ['Design & UX', 'Figma, maquettage, ergonomie et identité visuelle.'],
    ['Gestion & entrepreneuriat', 'Comptabilité, marketing, pitch et gestion de projet.'],
    ["Sciences de l'ingénieur", 'Électronique, mécanique, CAO et travaux pratiques.'],
    ['Langues', 'Anglais, français, espagnol, arabe.'],
    ['Mathématiques', 'Analyse, algèbre, probabilités.'],
    ['Présentation orale', 'Soutenances, prise de parole, communication.'],
  ]
  categories.forEach(([nom, description]) => db.categories.push({ id: uid(), nom, description, created_at: now() }))

  const admin = creerUtilisateur({
    email: 'admin@campus.ma', prenom: 'Walid', nom: 'Badi', filiere: 'DUT GI S3', role: 'admin',
    bio: 'Administrateur de SkillSwap Campus.',
    propose: ['UML', 'Python'], recherche: ['Anglais'],
  })
  const salima = creerUtilisateur({
    email: 'salima@campus.ma', prenom: 'Salima', nom: 'Chihal', filiere: 'DUT GI S3',
    bio: 'Passionnée de bases de données et de langues.', propose: ['SQL', 'Anglais'], recherche: ['React', 'Figma'],
  })
  const younes = creerUtilisateur({
    email: 'younes@campus.ma', prenom: 'Younes', nom: 'Akli', filiere: 'DUT GI S3',
    bio: 'Développeur front-end.', propose: ['React', 'Python'], recherche: ['SQL', 'Anglais'],
  })
  const kaouthar = creerUtilisateur({
    email: 'kaouthar@campus.ma', prenom: 'Kaouthar', nom: 'Gainou', filiere: 'DUT GI S3',
    bio: 'Data et statistiques.', propose: ['pandas', 'Python'], recherche: ['Figma', 'Prise de parole'],
  })
  const hajar = creerUtilisateur({
    email: 'hajar@campus.ma', prenom: 'Hajar', nom: 'Saidi', filiere: 'DUT GI S3',
    bio: 'Électronique embarquée.', propose: ['Arduino', 'Présentation orale'], recherche: ['Python', 'SQL'],
  })
  creerUtilisateur({
    email: 'inactif@campus.ma', prenom: 'Compte', nom: 'Désactivé', filiere: 'DUT GI S3',
    bio: 'Compte de démonstration désactivé (RG18).', statut: 'desactive',
  })

  // Offres
  const python = creerOffre(admin, { titre: 'Python pour débutants : bases et premiers scripts', categorie: 'Informatique & programmation', competence: 'Python', description: "Séance d'initiation : variables, boucles, fonctions et un petit script utile à la fin.", niveau: 'debutant', duree: 1, mode: 'presentiel' })
  const uml = creerOffre(admin, { titre: 'UML : diagrammes de cas d’utilisation et de classes', categorie: 'Informatique & programmation', competence: 'UML', description: 'Méthode pour modéliser un besoin : acteurs, cas d’utilisation, classes et associations.', niveau: 'intermediaire', duree: 2, mode: 'distance' })
  const sql = creerOffre(salima, { titre: 'SQL de zéro à la jointure avancée', categorie: 'Informatique & programmation', competence: 'SQL', description: 'SELECT, jointures, sous-requêtes et index sur une base de bibliothèque universitaire.', niveau: 'debutant', duree: 1, mode: 'presentiel' })
  const anglais = creerOffre(salima, { titre: 'Anglais conversationnel : gagner en aisance à l’oral', categorie: 'Langues', competence: 'Anglais', description: 'Conversation guidée sur la vie de campus, avec corrections bienveillantes.', niveau: 'intermediaire', duree: 1, mode: 'distance' })
  const react = creerOffre(younes, { titre: 'React : comprendre les hooks par la pratique', categorie: 'Informatique & programmation', competence: 'React', description: 'useState, useEffect et custom hooks sur un composant réel de votre projet.', niveau: 'intermediaire', duree: 2, mode: 'distance' })
  const pandas = creerOffre(kaouthar, { titre: "Python pour l'analyse de données : pandas en pratique", categorie: 'Informatique & programmation', competence: 'pandas', description: "Chargement, nettoyage et visualisation d'un jeu de données réel.", niveau: 'debutant', duree: 2, mode: 'presentiel' })
  const arduino = creerOffre(hajar, { titre: 'Arduino : premier capteur connecté', categorie: "Sciences de l'ingénieur", competence: 'Arduino', description: 'Câblage, lecture de capteur et envoi sur le port série.', niveau: 'debutant', duree: 2, mode: 'presentiel' })
  const oral = creerOffre(hajar, { titre: 'Réussir sa soutenance : prise de parole', categorie: 'Présentation orale', competence: 'Prise de parole', description: 'Structurer un exposé de 10 minutes, gérer le stress et les questions.', niveau: 'debutant', duree: 1, mode: 'presentiel' })
  creerOffre(younes, { titre: 'Git et GitHub en équipe (brouillon)', categorie: 'Informatique & programmation', competence: 'Git', description: 'Branches, pull requests et résolution de conflits.', niveau: 'intermediaire', duree: 1, mode: 'distance', statut: 'brouillon' })

  // Creneaux futurs libres
  creerCreneau(python, date(2, 14), 'Salle informatique 3')
  creerCreneau(python, date(4, 10), 'Salle informatique 3')
  creerCreneau(uml, date(3, 16), 'https://meet.google.com/skillswap-uml')
  const creneauSql = creerCreneau(sql, date(2, 15), 'Labo informatique 1')
  creerCreneau(sql, date(7, 11), 'Labo informatique 1')
  creerCreneau(anglais, date(5, 16), 'https://meet.google.com/skillswap-en')
  creerCreneau(react, date(1, 18), 'https://discord.gg/skillswap-react')
  creerCreneau(pandas, date(5, 9), 'Labo data')
  creerCreneau(arduino, date(6, 10), 'Atelier électronique')
  creerCreneau(oral, date(3, 11), 'Bibliothèque, salle B2')

  // Seance deja realisee et reglee : Younes a donne React a Kaouthar (2 credits transferes)
  // (Kaouthar a recu 2 credits de bienvenue : on lui en ajoute 2 via une seance realisee precedente pour que les soldes restent positifs)
  const cReact = creerCreneau(react, date(-3, 14), 'https://discord.gg/skillswap-react')
  const rReact = creerReservation({ offre: react, creneau: cReact, beneficiaire: kaouthar, statut: 'realisee', confirmeI: true, confirmeB: true })
  db.evaluations.push({ id: uid(), reservation_id: rReact.id, auteur_id: kaouthar.id, cible_id: younes.id, note: 5, commentaire: 'Très pédagogue, les hooks sont enfin clairs.', date: now() })

  // Seance passee en attente de confirmations (une seule confirmee) : Hajar a donne Arduino a Younes
  const cArd = creerCreneau(arduino, date(-1, 10), 'Atelier électronique')
  creerReservation({ offre: arduino, creneau: cArd, beneficiaire: younes, statut: 'acceptee', confirmeI: true, confirmeB: false })

  // Litige ouvert : Salima n'a pas eu la seance d'anglais avec Hajar (absence)
  const cEn = creerCreneau(anglais, date(-2, 17), 'https://meet.google.com/skillswap-en')
  const rLitige = creerReservation({ offre: anglais, creneau: cEn, beneficiaire: hajar, statut: 'en_litige' })
  db.litiges.push({
    id: uid(), reservation_id: rLitige.id, ouvert_par: hajar.id, type: 'absence', statut: 'ouvert', decision: null, motif_decision: '',
    elements: [
      { id: uid(), auteur_id: hajar.id, type: 'absence', texte: "L'intervenante ne s'est pas connectée au lien à l'heure prévue, j'ai attendu 20 minutes.", date: now() },
      { id: uid(), auteur_id: salima.id, type: 'desaccord', texte: "J'étais présente mais le lien Meet n'a pas fonctionné, j'ai proposé un nouveau créneau par message.", date: now() },
    ],
    created_at: now(),
  })

  // Demande en attente : Hajar souhaite le cours de SQL de Salima
  creerReservation({ offre: sql, creneau: creneauSql, beneficiaire: hajar, statut: 'en_attente' })

  // Seance acceptee a venir : Salima suit le cours UML de Walid (admin)
  const cUml = db.creneaux.find((c) => c.offre_id === uml.id)
  creerReservation({ offre: uml, creneau: cUml, beneficiaire: salima, statut: 'acceptee' })

  db.notifications.push(
    { id: uid(), user_id: salima.id, message: 'Votre demande « UML » a été acceptée.', lien: '/planning', lue: false, date: now() },
    { id: uid(), user_id: salima.id, message: 'Hajar demande la séance « SQL de zéro à la jointure avancée ».', lien: '/reservations', lue: false, date: now() },
    { id: uid(), user_id: admin.id, message: 'Nouveau litige sur « Anglais conversationnel ».', lien: '/admin', lue: false, date: now() },
  )
  save()
  return true
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (RESET) reset()
  else load()
  const created = seed()
  console.log(created ? 'Données de démonstration créées.' : 'La base contient déjà des données (utilisez npm run reset pour repartir de zéro).')
  console.log('Comptes : admin@campus.ma, salima@campus.ma, younes@campus.ma, kaouthar@campus.ma, hajar@campus.ma')
  console.log('Compte désactivé : inactif@campus.ma')
  console.log(`Mot de passe commun : ${PASSWORD}`)
}
