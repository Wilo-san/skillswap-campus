# SkillSwap Campus

Banque de temps entre étudiants : **un crédit correspond à une heure**. Un étudiant anime une séance, gagne des crédits, puis les utilise pour suivre la séance d'un autre étudiant, sans paiement en argent.

Mini-projet du module **GL & Modélisation UML (M234)**, DUT GI S3, EST Béni Mellal (Pr. Siham BAKKOURI, année 2026/2027).

Application web complète : **React + Vite + Tailwind** (interface) et **Node.js + Express** (API), avec persistance JSON atomique. Aucune base de données externe à installer.

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Fonctionnalités](#fonctionnalités)
- [Règles de gestion](#règles-de-gestion)
- [Cycle d'une séance](#cycle-dune-séance)
- [Architecture](#architecture)
- [API](#api)
- [Tests](#tests)
- [Documentation UML et rapport](#documentation-uml-et-rapport)
- [Configuration et déploiement](#configuration-et-déploiement)

## Démarrage rapide

Prérequis : **Node.js 18 ou supérieur**.

```bash
git clone https://github.com/Wilo-san/skillswap-campus.git
cd skillswap-campus
npm install        # serveur et client (workspaces npm)
npm run seed       # données de démonstration
npm run dev        # API :3001 + interface :5173
```

Ouvrir <http://localhost:5173>. Pour un seul processus : `npm run build && npm start` (interface et API sur <http://localhost:3001>).

## Comptes de démonstration

Mot de passe commun : `campus123`.

| Compte | Rôle | Situation dans les données de démo |
| --- | --- | --- |
| `admin@campus.ma` | Administrateur | Un litige ouvert à régler, offres UML et Python |
| `salima@campus.ma` | Étudiante | Reçoit une demande en attente (SQL), séance UML acceptée |
| `younes@campus.ma` | Étudiant | Séance Arduino à confirmer (2 crédits bloqués), évaluation à déposer |
| `kaouthar@campus.ma` | Étudiante | Séance React réalisée |
| `hajar@campus.ma` | Étudiante | Partie dans le litige « Anglais » |
| `inactif@campus.ma` | Compte désactivé | Connexion refusée (RG18) |

Le premier compte créé sur une base vide devient administrateur.

## Fonctionnalités

**Comptes et profils** : inscription, connexion, déconnexion, profil (nom, prénom, filière, compétences proposées et recherchées), solde disponible, crédits bloqués et historique des mouvements (date, quantité, type, séance concernée).

**Offres et créneaux** : création en brouillon, publication, archivage ; durée de 1 ou 2 heures (coût de 1 ou 2 crédits) ; créneaux datés (fin calculée) avec lieu ou lien visible des seuls participants ; recherche par compétence, catégorie, niveau, **date** et mode ; **suggestions** selon les compétences recherchées du profil.

**Réservations et planning** : demande sur un créneau, acceptation ou refus motivé, retrait d'une demande, annulation avant le début, planning personnel groupé par jour, **notifications** dans l'espace personnel (cloche).

**Réalisation et crédits** : confirmation par chaque participant après l'heure de fin, transfert unique après les deux confirmations, signalement d'absence ou de désaccord.

**Évaluations** : note de 1 à 5 et commentaire après une séance réalisée, note moyenne visible sur le profil public.

**Administration** : tableau de bord (comptes actifs, offres publiées, séances acceptées ou réalisées, crédits transférés, litiges ouverts), gestion des comptes (désactivation, réactivation), catégories (création, renommage, suppression), modération (masquer ou démasquer une offre), règlement des litiges (transfert intégral ou restitution intégrale, décision motivée).

## Règles de gestion

| Règle | Implémentation |
| --- | --- |
| RG01 | Courriel unique, 2 crédits de bienvenue une seule fois (mouvement `bienvenue`) |
| RG02 | Durée 1 h ou 2 h, coût égal à la durée |
| RG03 | Pas de réservation de sa propre offre, pas de doublon sur un créneau |
| RG04 | Offre `brouillon`, `publiee` ou `archivee` ; demande seulement sur offre publiée, intervenant actif, créneau futur non attribué |
| RG05 | Solde vérifié à la demande puis à l'acceptation ; une demande en attente ne bloque rien |
| RG06 | L'acceptation bloque le coût (mouvement `blocage`) |
| RG07 | Un seul créneau accepté ; les autres demandes en attente sont refusées automatiquement avec motif |
| RG08 | Pas de chevauchement de séances acceptées (séances consécutives autorisées) |
| RG09 | États `en_attente`, `refusee`, `acceptee`, `annulee`, `realisee`, `en_litige` |
| RG10 | Annulation avant le début : crédits libérés, créneau de nouveau libre ; après le début, signalement |
| RG11 | Confirmations après l'heure de fin, une par participant, puis transfert unique |
| RG12 | Confirmation manquante : crédits conservés, signalement possible, pas d'expiration automatique |
| RG13 | Litige : décision motivée de l'administrateur, transfert ou restitution intégrale, jamais partielle |
| RG14 | Règlement définitif, aucun second règlement |
| RG15 | Une évaluation par participant, uniquement sur séance réalisée |
| RG16 | Soldes disponible et bloqué jamais négatifs, journal de mouvements cohérent |
| RG17 | Archiver ou masquer une offre annule les demandes en attente et bloque la modification de la durée |
| RG18 | Compte désactivé : connexion refusée, demandes en attente annulées, séances acceptées traitées par l'administrateur |
| RG19 | Lieu ou lien visible des seuls participants, éléments d'un litige visibles des participants et de l'administrateur |

## Cycle d'une séance

```
en_attente ──accepter──▶ acceptee ──2 confirmations──▶ realisee   (transfert unique)
    │                       │  └──signalement──▶ en_litige ──transfert──▶ realisee
    │                       │                        └──restitution──▶ annulee
    ├──refuser / retirer──▶ refusee / annulee         
                            └──annuler (avant début)──▶ annulee      (crédits libérés)
```

## Architecture

```
skillswap-campus/
├── server/
│   ├── src/
│   │   ├── index.js            # Express, service de l'interface compilée
│   │   ├── db.js               # persistance atomique, portefeuille, notifications
│   │   ├── auth.js             # bcrypt, JWT, contrôle des droits
│   │   ├── seed.js             # données de démonstration
│   │   └── routes/             # auth, offres, reservations, meta (admin, dashboard)
│   └── test/regles.test.mjs    # 75 contrôles des règles RG01 à RG19
├── client/                     # React + Vite + Tailwind (pages, composants, lib)
└── docs/
    ├── uml/                    # sources PlantUML (.puml) et exports PNG/SVG
    ├── cas-utilisation.md      # fiches des principaux cas d'utilisation
    ├── rapport/                # rapport (Markdown + PDF) et script de génération
    └── captures/               # captures des interfaces
```

Choix de conception : les routes sont **synchrones**, donc une requête s'exécute en entier avant la suivante, et chaque action contrôle l'état de la réservation avant d'agir. Un double clic ou deux requêtes simultanées ne peuvent donc ni attribuer deux fois un créneau ni transférer deux fois des crédits. Le solde est **calculé à partir du journal des mouvements** et toute écriture qui rendrait un solde négatif est refusée.

## API

Préfixe `/api`. Routes protégées : en-tête `Authorization: Bearer <jeton>`.

| Méthode | Route | Description |
| --- | --- | --- |
| `POST` | `/auth/register`, `/auth/login` | Inscription, connexion |
| `GET` `PUT` | `/auth/me`, `/auth/profil` | Profil personnel |
| `GET` | `/auth/profils/:id` | Profil public, évaluations, note moyenne |
| `GET` | `/offres`, `/offres/:id` | Catalogue (`q`, `categorie`, `niveau`, `mode`, `date`), fiche |
| `GET` | `/suggestions` | Offres correspondant aux compétences recherchées |
| `POST` `PUT` `DELETE` | `/offres`, `/offres/:id` | Créer, modifier (statut inclus), supprimer |
| `POST` `DELETE` | `/offres/:id/creneaux`, `/creneaux/:id` | Gérer les créneaux |
| `POST` | `/reservations` | Demander un créneau |
| `POST` | `/reservations/:id/accepter` `refuser` `retirer` `annuler` | Décisions et annulations |
| `POST` | `/reservations/:id/confirmer` | Confirmer la réalisation (transfert à la seconde confirmation) |
| `POST` | `/reservations/:id/signaler` | Ouvrir ou compléter un signalement |
| `POST` | `/reservations/:id/evaluer` | Noter l'autre participant |
| `GET` | `/reservations`, `/planning`, `/credits`, `/dashboard`, `/notifications` | Espace personnel |
| `GET` `POST` `PUT` `DELETE` | `/categories` | Catégories (écriture réservée à l'administrateur) |
| `GET` `POST` | `/admin/synthese` `litiges` `offres` `comptes` | Administration |
| `POST` | `/admin/litiges/:id/regler`, `/admin/offres/:id/masquer`, `/admin/comptes/:id/statut`, `/admin/reservations/:id/annuler` | Décisions de l'administrateur |

## Tests

```bash
npm test
```

Lance le serveur sur une base temporaire et exécute 75 contrôles d'intégration couvrant RG01 à RG19, y compris les **doubles clics simultanés** (double acceptation, double confirmation) et les contrôles de droits (403 pour un tiers ou un non-administrateur).

## Documentation UML et rapport

- Sources PlantUML : `docs/uml/src/*.puml` ; exports lisibles : `docs/uml/export/` (régénération : `python3 docs/uml/render.py`)
- Fiches des cas d'utilisation : `docs/cas-utilisation.md`
- Rapport : `docs/rapport/rapport.md` et `docs/rapport/Rapport_SkillSwap_Campus.pdf` (régénération : `bash docs/rapport/build_pdf.sh`)

## Configuration et déploiement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `PORT` | Port du serveur | `3001` |
| `JWT_SECRET` | Secret de signature des jetons (à définir en production) | valeur de développement |
| `DATA_DIR` | Dossier de la base JSON (doit être persistant) | `server/data` |

```bash
npm install && npm run build && npm run reset
JWT_SECRET=<valeur-longue-aleatoire> npm start
```

## Licence

MIT, voir [LICENSE](LICENSE).
