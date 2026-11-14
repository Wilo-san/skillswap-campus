import bcrypt from 'bcryptjs'
import { load, reset, get, save, uid, now, mouvement } from './db.js'

const PASSWORD = 'campus123'
const RESET = process.argv.includes('--reset')

function plusJours(jours, heure = 10) {
  const d = new Date()
  d.setDate(d.getDate() + jours)
  d.setHours(heure, 0, 0, 0)
  return d.toISOString()
}

function creerUtilisateur({ email, prenom, nom, filiere, role = 'etudiant', bio = '', propose = [], recherche = [] }) {
  const db = get()
  const user = {
    id: uid(),
    email,
    password_hash: bcrypt.hashSync(PASSWORD, 10),
    role,
    created_at: now(),
  }
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
    solde_credits: 5,
    statut: 'actif',
    created_at: now(),
  })
  mouvement({
    user_id: user.id,
    type: 'bonus',
    quantite: 5,
    description: 'Solde de bienvenue',
  })
  return user
}

function demarrer() {
  if (RESET) reset()
  else load()

  const db = get()
  if (db.users.length > 0 && !RESET) {
    console.log('Base deja initialisee. Utilisez `npm run reset` pour repartir de zero.')
    return
  }

  const admin = creerUtilisateur({
    email: 'admin@campus.ma',
    prenom: 'Walid',
    nom: 'Badi',
    filiere: 'Génie informatique — S4',
    role: 'admin',
    bio: 'Coordinateur SkillSwap Campus, etudiant en genie logiciel.',
    propose: ['UML', 'React', 'Gestion de projet'],
    recherche: ['Machine learning', 'Anglais technique'],
  })

  const salima = creerUtilisateur({
    email: 'salima@campus.ma',
    prenom: 'Salima',
    nom: 'Chihal',
    filiere: 'Genie informatique',
    bio: 'Passionnee de bases de donnees et de SQL. J aime expliquer avec des schemas simples.',
    propose: ['SQL', 'Bases de donnees', 'Merise'],
    recherche: ['React', 'UI design'],
  })

  const younes = creerUtilisateur({
    email: 'younes@campus.ma',
    prenom: 'Younes',
    nom: 'Akli',
    filiere: 'Genie logiciel',
    bio: 'Dev full-stack, je prepare les entretiens techniques du campus.',
    propose: ['React', 'Node.js', 'Algorithmique'],
    recherche: ['Anglais technique', 'DevOps'],
  })

  const kaouthar = creerUtilisateur({
    email: 'kaouthar@campus.ma',
    prenom: 'Kaouthar',
    nom: 'Gainou',
    filiere: 'Data science',
    bio: 'Je manipule Python et pandas tous les jours, et je dessine des visualisations claires.',
    propose: ['Python', 'pandas', 'Statistiques'],
    recherche: ['SQL', 'UML'],
  })

  const hajar = creerUtilisateur({
    email: 'hajar@campus.ma',
    prenom: 'Hajar',
    nom: 'Saidi',
    filiere: 'Genie electrique',
    bio: 'Arduino, capteurs et systemes embarques. Toujours partante pour un montage.',
    propose: ['Arduino', 'Electronique', 'Matlab'],
    recherche: ['Python', 'Gestion de projet'],
  })

  const categories = [
    ['Informatique & programmation', 'Langages, algorithmique, développement web et mobile.'],
    ['Design & UX', 'Figma, maquettage, ergonomie et identité visuelle.'],
    ['Gestion & entrepreneuriat', 'Comptabilité, marketing, pitch et gestion de projet.'],
    ["Sciences de l'ingénieur", 'Électronique, mécanique, CAO et travaux pratiques.'],
    ['Langues', 'Anglais, français, espagnol, arabe'],
    ['Mathématiques', 'Analyse, algèbre, probabilités'],
  ]
  categories.forEach(([nom, description]) => {
    db.categories.push({ id: uid(), nom, description, created_at: now() })
  })

  const offres = [
    {
      intervenant: admin,
      titre: 'Python pour débutants : bases et premiers scripts',
      categorie: 'Informatique & programmation',
      competence: 'Python',
      description:
        "Séance d'initiation : variables, boucles, fonctions et un petit script utile à la fin. On travaille sur votre machine, avec des exercices adaptés à votre niveau. Idéal si vous débutez complètement.",
      niveau: 'debutant',
      duree: '1h',
      mode: 'presentiel',
      cout: 1,
      creneaux: [plusJours(2, 14), plusJours(4, 10)],
      lieu: 'Salle informatique 3',
    },
    {
      intervenant: admin,
      titre: 'Figma : maquetter une application mobile de A à Z',
      categorie: 'Design & UX',
      competence: 'Figma',
      description:
        "Nous construisons ensemble l'écran d'accueil d'une application : grille, composants réutilisables, prototype cliquable. Vous repartez avec votre fichier Figma et les bonnes pratiques d'ergonomie mobile.",
      niveau: 'intermediaire',
      duree: '1h',
      mode: 'en_ligne',
      cout: 2,
      creneaux: [plusJours(1, 18), plusJours(3, 18)],
      lieu: 'Google Meet',
    },
    {
      intervenant: admin,
      titre: 'Anglais conversationnel : gagner en aisance à l’oral',
      categorie: 'Langues',
      competence: 'Anglais',
      description:
        'Une heure de conversation guidée autour de sujets du quotidien et de la vie de campus, avec corrections bienveillantes et vocabulaire utile pour les entretiens et présentations.',
      niveau: 'intermediaire',
      duree: '1h',
      mode: 'presentiel',
      cout: 1,
      creneaux: [plusJours(5, 16)],
      lieu: 'Bibliothèque, salle B2',
    },
    {
      intervenant: admin,
      titre: 'Analyse : maîtriser intégrales et primitives avant les partiels',
      categorie: 'Mathématiques',
      competence: 'Analyse',
      description:
        'Deux heures de travail ciblé sur les intégrales : méthodes de calcul, intégration par parties, exercices type examen corrigés pas à pas. Venez avec votre polycopié et vos questions.',
      niveau: 'avance',
      duree: '2h',
      mode: 'presentiel',
      cout: 2,
      creneaux: [plusJours(3, 9)],
      lieu: 'Amphi C',
    },
    {
      intervenant: admin,
      titre: 'Excel : tableaux croisés dynamiques et formules utiles',
      categorie: 'Gestion & entrepreneuriat',
      competence: 'Excel',
      description:
        "À partir d'un jeu de données réel, on construit un tableau de bord simple : rechercheV, SI imbriqués, tableaux croisés et mise en forme conditionnelle. Utile pour les rapports de stage.",
      niveau: 'debutant',
      duree: '2h',
      mode: 'en_ligne',
      cout: 1,
      creneaux: [plusJours(6, 15)],
      lieu: 'Teams',
    },
    {
      intervenant: salima,
      titre: 'SQL de zéro à la jointure avancée',
      categorie: 'Informatique & programmation',
      competence: 'SQL',
      description:
        "On part des SELECT simples et on arrive aux jointures, sous-requêtes et index. Exercices sur une base de bibliothèque universitaire.",
      niveau: 'debutant',
      duree: '1h30',
      mode: 'presentiel',
      cout: 1,
      creneaux: [plusJours(2, 15), plusJours(7, 11)],
      lieu: 'Labo informatique 1',
    },
    {
      intervenant: younes,
      titre: 'React : comprendre les hooks par la pratique',
      categorie: 'Informatique & programmation',
      competence: 'React',
      description:
        "useState, useEffect, custom hooks et gestion des formulaires. On refactorise ensemble un composant réel de votre projet.",
      niveau: 'intermediaire',
      duree: '2h',
      mode: 'en_ligne',
      cout: 2,
      creneaux: [plusJours(1, 18), plusJours(4, 18)],
      lieu: 'Discord du campus',
    },
    {
      intervenant: kaouthar,
      titre: "Python pour l'analyse de données : pandas en pratique",
      categorie: 'Informatique & programmation',
      competence: 'pandas',
      description:
        "Chargement, nettoyage et visualisation d'un jeu de données réel. Vous repartez avec un notebook fonctionnel et la méthode de travail.",
      niveau: 'debutant',
      duree: '2h',
      mode: 'presentiel',
      cout: 2,
      creneaux: [plusJours(5, 9)],
      lieu: 'Labo data',
    },
    {
      intervenant: hajar,
      titre: 'Arduino : premier capteur connecté',
      categorie: "Sciences de l'ingénieur",
      competence: 'Arduino',
      description:
        'Câblage, lecture de capteur et envoi sur le port série. Matériel fourni, vous gardez votre montage en fin de séance.',
      niveau: 'debutant',
      duree: '2h',
      mode: 'presentiel',
      cout: 2,
      creneaux: [plusJours(6, 10)],
      lieu: 'Atelier électronique',
    },
  ]

  const creneauxCrees = []
  offres.forEach((o) => {
    const offre = {
      id: uid(),
      titre: o.titre,
      categorie: o.categorie,
      competence: o.competence,
      description: o.description,
      niveau: o.niveau,
      duree: o.duree,
      mode: o.mode,
      cout_credits: o.cout,
      statut: 'publiee',
      intervenant_id: o.intervenant.id,
      intervenant_nom: `${o.intervenant.email.split('@')[0]}`,
      filiere_intervenant:
        db.profils.find((p) => p.user_id === o.intervenant.id)?.filiere || '',
      created_at: now(),
    }
    const profil = db.profils.find((p) => p.user_id === o.intervenant.id)
    offre.intervenant_nom = `${profil.prenom} ${profil.nom}`
    db.offres.push(offre)

    o.creneaux.forEach((debut, index) => {
      const fin = new Date(new Date(debut).getTime() + (o.duree === '2h' ? 120 : 90) * 60000).toISOString()
      const creneau = {
        id: uid(),
        offre_id: offre.id,
        intervenant_id: o.intervenant.id,
        debut,
        fin,
        lieu: o.lieu,
        statut: 'libre',
        created_at: now(),
      }
      db.creneaux.push(creneau)
      if (index === 0) creneauxCrees.push({ offre, creneau })
    })
  })

  // Reservation confirmee : Younes donne un cours de React a Kaouthar
  const reactions = creneauxCrees.find((c) => c.offre.competence === 'React')
  const [offreReact, creneauReact] = [reactions.offre, reactions.creneau]
  creneauReact.statut = 'reserve'
  const resaConfirmee = {
    id: uid(),
    offre_id: offreReact.id,
    creneau_id: creneauReact.id,
    offre_titre: offreReact.titre,
    beneficiaire_id: kaouthar.id,
    beneficiaire_nom: 'Kaouthar Gainou',
    intervenant_id: younes.id,
    intervenant_nom: 'Younes Akli',
    cout: offreReact.cout_credits,
    debut: creneauReact.debut,
    fin: creneauReact.fin,
    lieu: creneauReact.lieu,
    message: 'Je veux comprendre les hooks avant mon stage.',
    motif: '',
    resolution: '',
    solde_beneficiaire: 5,
    confirme_beneficiaire: true,
    confirme_intervenant: true,
    statut: 'confirmee',
    created_at: now(),
  }
  db.reservations.push(resaConfirmee)
  mouvement({
    user_id: kaouthar.id,
    reservation_id: resaConfirmee.id,
    type: 'debit',
    quantite: -offreReact.cout_credits,
    description: `Session « ${offreReact.titre} » avec Younes Akli`,
  })
  mouvement({
    user_id: younes.id,
    reservation_id: resaConfirmee.id,
    type: 'credit',
    quantite: offreReact.cout_credits,
    description: `Session « ${offreReact.titre} » pour Kaouthar Gainou`,
  })

  // Demande en attente : Hajar souhaite un cours de SQL a Salima
  const sql = creneauxCrees.find((c) => c.offre.competence === 'SQL')
  const [offreSql, creneauSql] = [sql.offre, sql.creneau]
  creneauSql.statut = 'demande'
  db.reservations.push({
    id: uid(),
    offre_id: offreSql.id,
    creneau_id: creneauSql.id,
    offre_titre: offreSql.titre,
    beneficiaire_id: hajar.id,
    beneficiaire_nom: 'Hajar Saidi',
    intervenant_id: salima.id,
    intervenant_nom: 'Salima Chihal',
    cout: offreSql.cout_credits,
    debut: creneauSql.debut,
    fin: creneauSql.fin,
    lieu: creneauSql.lieu,
    message: 'J ai un projet de base de donnees a rendre la semaine prochaine.',
    motif: '',
    resolution: '',
    solde_beneficiaire: 5,
    confirme_beneficiaire: true,
    confirme_intervenant: false,
    statut: 'en_attente',
    created_at: now(),
  })

  save()
  console.log('Donnees de demonstration creees.')
  console.log('Comptes : admin@campus.ma, salima@campus.ma, younes@campus.ma, kaouthar@campus.ma, hajar@campus.ma')
  console.log(`Mot de passe commun : ${PASSWORD}`)
}

demarrer()
