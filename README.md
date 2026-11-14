# SkillSwap Campus

Plateforme collaborative ou les etudiants echangent leurs competences academiques et techniques au sein du campus : on publie ce que l on sait faire, on reserve un creneau avec un autre etudiant, et on paie en credits. Une session donnee rapporte des credits, une session recue en coute.

Application full-stack autonome : **React + Vite + Tailwind** pour l interface, **Node.js + Express** pour l API, stockage JSON persistant (aucune base externe a installer).

## Sommaire

- [Fonctionnalites](#fonctionnalites)
- [Demarrage rapide](#demarrage-rapide)
- [Comptes de demonstration](#comptes-de-demonstration)
- [Regles metier](#regles-metier)
- [Architecture](#architecture)
- [API](#api)
- [Scripts](#scripts)
- [Deploiement](#deploiement)
- [Licence](#licence)

## Fonctionnalites

- **Authentification** : inscription et connexion par email + mot de passe (JWT), creation automatique du profil avec 5 credits de bienvenue.
- **Profil etudiant** : prenom, nom, filiere, bio, competences proposees et recherchees, solde de credits.
- **Marche des competences** : recherche plein texte, filtres par categorie, niveau, mode (presentiel / en ligne), filiere ; fiche detaillee avec intervenant et creneaux.
- **Offres** : creation, modification, archivage, republication, suppression, ajout et retrait de creneaux.
- **Reservations avec double confirmation** : le beneficiaire envoie une demande, l intervenant confirme, puis les credits sont transferes automatiquement et le creneau passe en reserve.
- **Gestion des incidents** : refus motive, annulation avec remboursement, litige et resolution (remboursement du beneficiaire).
- **Credits** : historique complet des mouvements (bonus, gain, depense, remboursement) et solde toujours coherent.
- **Tableau de bord** : prochaines sessions, demandes en attente, statistiques personnelles.
- **Administration** : vue d ensemble du campus, gestion des categories, moderation des offres, traitement des litiges.
- **UI** : interface francaise, responsive (mobile et desktop), etats vides et messages d erreur explicites.

## Demarrage rapide

Prerequis : **Node.js 18 ou superieur**.

```bash
git clone <url-du-depot>
cd skillswap-campus
npm install        # installe le serveur et le client (workspaces npm)
npm run seed       # cree les donnees de demonstration
npm run dev        # API sur :3001 + interface sur :5173
```

Ouvrir <http://localhost:5173>. Connectez-vous avec un compte de demonstration ci-dessous.

Pour une execution en un seul processus (build de l interface puis serveur) :

```bash
npm run build
npm start          # interface + API sur http://localhost:3001
```

## Comptes de demonstration

| Compte | Role | Mot de passe |
| --- | --- | --- |
| `admin@campus.ma` | Administrateur (Walid Badi) | `campus123` |
| `salima@campus.ma` | Etudiante · SQL | `campus123` |
| `younes@campus.ma` | Etudiant · React | `campus123` |
| `kaouthar@campus.ma` | Etudiante · pandas | `campus123` |
| `hajar@campus.ma` | Etudiante · Arduino | `campus123` |

Le premier compte cree sur une base vide recoit automatiquement le role administrateur.

## Regles metier

1. Un nouvel inscrit recoit **5 credits** (mouvement `bonus`).
2. Une offre appartient a son intervenant qui seul peut la modifier, l archiver ou gerer ses creneaux.
3. Impossible de reserver sa propre offre, un creneau deja pris ou un creneau passe.
4. Une reservation exige un solde suffisant ; le debit n a lieu qu apres confirmation.
5. La confirmation de l intervenant finalise la session : debit du beneficiaire, credit de l intervenant, creneau `reserve`.
6. Une annulation ou un refus sur une session confirmee genere des mouvements `remboursement` symetriques.
7. Un litige se declare sur une session confirmee avec un motif d au moins 10 caracteres ; sa resolution peut rembourser le beneficiaire.

## Architecture

```
skillswap-campus/
├── package.json           # workspaces + scripts racine
├── server/
│   ├── src/
│   │   ├── index.js       # application Express, service de l interface compilee
│   │   ├── db.js          # persistance JSON, soldes et mouvements de credits
│   │   ├── auth.js        # hash bcrypt, JWT, middlewares
│   │   ├── seed.js        # donnees de demonstration
│   │   └── routes/
│   │       ├── auth.js         # inscription, connexion, profil
│   │       ├── offres.js       # offres, creneaux, categories, credits
│   │       ├── reservations.js # cycle de vie des reservations
│   │       └── meta.js         # tableau de bord et synthese admin
│   └── data/db.json       # base JSON generee (ignoree par git)
└── client/
    ├── index.html
    ├── src/
    │   ├── App.jsx        # routes protegees
    │   ├── lib/           # client HTTP, contexte d authentification, formats
    │   ├── components/    # layout, composants UI reutilisables
    │   └── pages/         # connexion, dashboard, marche, offre, offres, reservations, credits, profil, admin
    └── vite.config.js     # proxy /api vers le serveur en developpement
```

## API

Toutes les routes sont prefixees par `/api`. Les routes protegees attendent l en-tete `Authorization: Bearer <token>`.

| Methode | Route | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Creer un compte (email, mot de passe, prenom, nom, filiere) |
| `POST` | `/auth/login` | Connexion, retourne un token JWT |
| `GET` | `/auth/me` | Profil de l utilisateur connecte |
| `PUT` | `/auth/profil` | Mettre a jour le profil et les competences |
| `GET` | `/categories` | Categories et nombre d offres publiees |
| `POST` | `/categories` | Creer une categorie (admin) |
| `DELETE` | `/categories/:id` | Supprimer une categorie inutilisee (admin) |
| `GET` | `/offres` | Liste filtrable : `q`, `categorie`, `niveau`, `mode`, `filiere`, `statut`, `intervenant=me` |
| `GET` | `/offres/:id` | Detail d une offre et de ses creneaux |
| `POST` | `/offres` | Publier une offre |
| `PUT` | `/offres/:id` | Modifier une offre ou changer son statut |
| `DELETE` | `/offres/:id` | Supprimer une offre sans reservation active |
| `POST` | `/offres/:id/creneaux` | Ajouter un creneau (debut, fin, lieu) |
| `DELETE` | `/creneaux/:id` | Retirer un creneau libre |
| `POST` | `/reservations` | Demander un creneau |
| `GET` | `/reservations?role=tous\|recues\|envoyees` | Reservations de l utilisateur |
| `POST` | `/reservations/:id/confirmer` | Confirmation par un participant |
| `POST` | `/reservations/:id/annuler` | Annulation par le beneficiaire |
| `POST` | `/reservations/:id/refuser` | Refus motive par l intervenant |
| `POST` | `/reservations/:id/litige` | Signaler un probleme |
| `POST` | `/reservations/:id/resoudre` | Resoudre un litige (intervenant ou admin) |
| `GET` | `/credits` | Solde et historique des mouvements |
| `GET` | `/dashboard` | Prochaines sessions, demandes et statistiques |
| `GET` | `/admin/synthese` | Indicateurs globaux (admin) |
| `GET` | `/admin/offres` | Toutes les offres (admin) |
| `GET` | `/admin/litiges` | Litiges en cours et resolus (admin) |
| `GET` | `/health` | Etat du service |

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | API (watch) + interface Vite avec proxy |
| `npm run build` | Build de production de l interface |
| `npm start` | Serveur API servant l interface compilee |
| `npm run seed` | Donnees de demonstration si la base est vide |
| `npm run reset` | Reinitialise completement la base de demonstration |

## Deploiement

1. `npm install && npm run build && npm run reset`
2. Definir les variables d environnement :

```bash
PORT=3001
JWT_SECRET=<chaine-aleatoire-longue>
DATA_DIR=/chemin/vers/un/volume/persistant   # optionnel
```

3. `npm start` puis exposer le port 3001 (Railway, Render, Fly.io, un VPS derriere Nginx...).

Le dossier `DATA_DIR` doit etre persistant : la base JSON y est ecrite de maniere atomique (`db.json`).

## Licence

MIT — voir [LICENSE](LICENSE).
