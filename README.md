# SkillSwap Campus

Plateforme web d'échange de compétences entre étudiants, fondée sur une **banque de temps** : on anime une séance pour gagner des crédits, on en réserve une pour en dépenser. Aucun argent ne circule.

Application **full-stack réellement opérationnelle** : interface React, API REST, base PostgreSQL persistante, authentification par jeton, autorisations par rôle et espace administrateur distinct.

![Tableau de bord](docs/captures/02-tableau-de-bord.png)

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Règles de gestion](#règles-de-gestion)
- [Technologies](#technologies)
- [Architecture](#architecture)
- [Installation](#installation)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Tests](#tests)
- [API REST](#api-rest)
- [Sécurité](#sécurité)
- [Limitations connues](#limitations-connues)

---

## Fonctionnalités

### Espace étudiant

| Domaine | Détail |
|---|---|
| **Compte** | Inscription, connexion, mot de passe haché (bcrypt, coût 12), profil modifiable, changement de mot de passe. 2 crédits de bienvenue à l'inscription. |
| **Profil** | Filière, présentation, compétences proposées et recherchées. Profil public consultable par les autres étudiants (note moyenne, évaluations, séances animées et suivies). |
| **Offres** | Création, modification, publication, dépublication, archivage, suppression. Ajout et retrait de créneaux. Durée de 1 ou 2 heures. Mode présentiel ou à distance. |
| **Catalogue** | Recherche plein texte, filtres par catégorie, niveau, mode et date. Seules les offres publiées, non masquées, avec au moins un créneau futur disponible apparaissent. |
| **Suggestions** | Recommandations calculées à partir des compétences recherchées déclarées dans le profil (correspondance par compétence, titre ou catégorie). |
| **Demandes** | Demande de séance, retrait, acceptation, refus motivé. Une demande acceptée bloque le coût sur le compte du bénéficiaire. |
| **Planning** | Séances à venir regroupées par jour, séances à confirmer, séances réalisées. |
| **Validation** | Double confirmation de réalisation après l'heure de fin. Le transfert des crédits n'a lieu qu'après les deux confirmations. |
| **Signalements** | Ouverture d'un litige (absence, désaccord, confirmation manquante, autre), échange d'éléments entre les parties, décision de l'administrateur. |
| **Évaluations** | Note de 1 à 5 et commentaire, une seule fois par participant, uniquement après une séance réalisée. |
| **Crédits** | Solde disponible et bloqué, historique complet et paginé de tous les mouvements (bonus, blocage, libération, transfert, restitution). |
| **Notifications** | Cloche avec compteur de non-lues, marquage individuel ou global, rafraîchissement périodique. |

### Espace administrateur (indépendant)

| Domaine | Détail |
|---|---|
| **Tableau de bord** | Comptes actifs, offres publiées, séances acceptées et réalisées, crédits transférés, crédits bloqués, litiges à traiter. |
| **Comptes** | Recherche, activation et désactivation, attribution ou retrait du rôle administrateur. Protection du dernier administrateur actif. |
| **Catégories** | Création, renommage, activation et désactivation, suppression (refusée si des offres l'utilisent). |
| **Modération** | Masquage motivé d'une offre (notification de l'intervenant, annulation des demandes en attente) et rétablissement. |
| **Litiges** | Consultation des éléments des deux parties, décision motivée : transfert intégral à l'intervenant ou restitution intégrale au bénéficiaire. Règlement unique. |
| **Annulation** | Annulation administrative d'une séance acceptée avec libération intégrale des crédits bloqués. |
| **Journal d'audit** | Traçabilité des actions d'administration. |

### Aperçus

| Catalogue | Crédits | Administration |
|---|---|---|
| ![Catalogue](docs/captures/03-catalogue.png) | ![Crédits](docs/captures/04-credits.png) | ![Admin](docs/captures/05-admin.png) |

---

## Règles de gestion

Les règles sont appliquées dans le service métier (`backend/src/services/`), **et** garanties au niveau de la base par des contraintes SQL (défense en profondeur).

| # | Règle | Mise en œuvre |
|---|---|---|
| RG01 | Un compte par adresse électronique ; 2 crédits de bienvenue une seule fois | Index unique sur `User.email`, index unique partiel sur le mouvement `WELCOME_BONUS` |
| RG02 | 1 crédit = 1 heure ; durée d'une offre limitée à 1 ou 2 heures | `CHECK` sur `Offer.durationHours` et `Booking.cost` |
| RG03 | Pas de réservation de sa propre offre ; une seule demande active par étudiant et par créneau | `CHECK` `teacherId <> learnerId` + index unique partiel sur les statuts `PENDING`/`ACCEPTED` |
| RG04 | Seules les offres publiées et non masquées sont réservables | Filtrage du catalogue et contrôle à la demande |
| RG05 | Le solde est vérifié à la demande **et de nouveau** à l'acceptation | Lecture verrouillée du compte dans la transaction |
| RG06 | L'acceptation bloque le coût sur le compte du bénéficiaire | `BLOCK` : disponible −coût, bloqué +coût |
| RG07 | Un créneau n'accueille qu'une seule séance acceptée ; les autres demandes sont refusées avec motif | Verrou `FOR UPDATE` sur le créneau + index unique partiel sur `ACCEPTED`/`DISPUTED` |
| RG08 | Aucun chevauchement d'horaires pour l'intervenant ni le bénéficiaire ; séances consécutives autorisées | Requête de chevauchement sur les séances acceptées (`startsAt < fin AND endsAt > début`) |
| RG09 | Le bénéficiaire retire une demande en attente ; l'intervenant refuse avec un motif obligatoire | Transitions d'état contrôlées |
| RG10 | Annulation possible seulement avant le début ; les crédits sont alors libérés et le créneau redevient réservable | `RELEASE` : bloqué −coût, disponible +coût |
| RG11 | Double confirmation après l'heure de fin, une seule par participant ; aucun transfert si un litige est ouvert | Table `Confirmation` avec clé unique `(bookingId, userId)` |
| RG12 | En cas de confirmation manquante ou de désaccord, les crédits restent bloqués | Aucun transfert automatique |
| RG13 | L'administrateur décide : transfert intégral ou restitution intégrale, décision motivée | Service `resolveDispute` |
| RG14 | Règlement unique : un seul transfert et une seule restitution par réservation | Index uniques partiels sur `TRANSFER_OUT`, `TRANSFER_IN`, `REFUND` |
| RG15 | Évaluation de 1 à 5, une seule par participant, uniquement après une séance réalisée | `CHECK` sur la note, clé unique `(bookingId, reviewerId)`, interdiction de s'auto-évaluer |
| RG16 | Les soldes ne sont jamais négatifs | `CHECK` sur `availableCredits` et `blockedCredits`, opérations en transaction |
| RG17 | Archiver ou masquer une offre annule les demandes en attente ; les séances acceptées suivent leur cours | Annulation ciblée des `PENDING` uniquement |
| RG18 | Désactiver un compte annule ses demandes en attente et dépublie ses offres ; aucun crédit n'est perdu | Annulation administrative distincte pour les séances acceptées |
| RG19 | Le lieu précis et le lien de réunion ne sont visibles que des participants, et seulement après acceptation | Sérialiseurs `viewOffer` / `viewBooking` / `viewDispute` |

**Concurrence.** Toutes les opérations de crédits s'exécutent dans une transaction PostgreSQL avec verrouillage `SELECT … FOR UPDATE`. L'ordre de verrouillage est global et constant (**créneau → réservation → comptes triés par identifiant**) afin d'éviter les interblocages. Les doubles clics et les requêtes simultanées sont couverts par des tests dédiés.

---

## Technologies

**Frontend** — React 19, TypeScript, Vite, Tailwind CSS, React Router, Lucide (icônes), typographies Inter et Plus Jakarta Sans.

**Backend** — Node.js, Express 5, TypeScript, API REST, Zod (validation), JWT, bcrypt, Helmet, CORS, limitation de débit.

**Base de données** — PostgreSQL 16, Prisma ORM 7 (migrations versionnées, contraintes et index partiels en SQL).

**Tests** — Vitest + Supertest, exécutés contre une instance PostgreSQL réelle.

---

## Architecture

```
skillswap-campus/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma            # modèle de données
│   │   ├── migrations/              # migrations SQL (contraintes métier incluses)
│   │   └── seed.ts                  # données de démonstration
│   ├── src/
│   │   ├── app.ts                   # application Express
│   │   ├── server.ts                # point d'entrée
│   │   ├── lib/                     # configuration, Prisma, erreurs, validation
│   │   ├── middleware/              # authentification, rôles, gestion d'erreurs
│   │   ├── services/                # règles métier (crédits, réservations, notifications)
│   │   └── routes/                  # endpoints REST
│   └── tests/                       # 71 tests d'intégration
├── frontend/
│   └── src/
│       ├── components/              # bibliothèque UI, mise en page, cartes
│       ├── lib/                     # client API, authentification, formatage, hooks
│       └── pages/                   # pages étudiant et pages admin
├── docs/captures/                   # captures d'écran
├── docker-compose.yml               # PostgreSQL local
├── .env.example
└── package.json                     # scripts racine
```

Le dossier `database/` du cahier des charges est ici représenté par `backend/prisma/` (schéma, migrations et jeu de données), conformément à l'organisation d'un projet Prisma.

---

## Installation

### Prérequis

- Node.js 20 ou supérieur
- PostgreSQL 14 ou supérieur (ou Docker)

### 1. Cloner le dépôt

```bash
git clone https://github.com/Wilo-san/skillswap-campus.git
cd skillswap-campus
git checkout v2-typescript-postgres   # branche de cette version
```

### 2. Base de données

Avec Docker :

```bash
docker compose up -d db
```

Ou avec une instance PostgreSQL existante :

```bash
createdb skillswap
```

### 3. Dépendances

```bash
npm install
```

### 4. Variables d'environnement

```bash
cp .env.example backend/.env
```

Renseignez au minimum `DATABASE_URL` et `JWT_SECRET` dans `backend/.env`.

### 5. Migrations et données de démonstration

```bash
npm run db:migrate     # applique les migrations
npm run db:seed        # crée les comptes et les offres de démonstration
```

### 6. Lancement

Deux terminaux :

```bash
npm run dev:api        # API sur http://localhost:4000
npm run dev:web        # interface sur http://localhost:5173
```

Le frontend redirige automatiquement les appels `/api` vers le backend.

### Production

```bash
npm run build
npm run start:api      # sert l'API compilée
```

Pour servir l'interface, publiez le contenu de `frontend/dist` derrière un serveur web et faites pointer `/api` vers le backend.

---

## Comptes de démonstration

Créés par `npm run db:seed`.

| Rôle | Adresse électronique | Mot de passe |
|---|---|---|
| Administrateur | `admin@skillswap.ma` | `Admin1234` |
| Étudiante | `sara@skillswap.ma` | `Demo1234` |
| Étudiant | `amine@skillswap.ma` | `Demo1234` |
| Étudiante | `yasmine@skillswap.ma` | `Demo1234` |
| Étudiant | `omar@skillswap.ma` | `Demo1234` |

> Ces identifiants ne concernent que les données de démonstration locale. Aucun mot de passe n'est stocké en clair : le script de seed les hache avec bcrypt.

---

## Tests

```bash
npm test
```

La suite couvre 71 scénarios d'intégration exécutés contre un vrai PostgreSQL (base `skillswap_test`) :

- inscription, unicité du courriel, hachage, inscription simultanée, compte désactivé ;
- protection des routes privées et des routes d'administration ;
- publication d'offres, cohérence des créneaux, catalogue et suggestions, RG19 ;
- demande, acceptation, refus, retrait, annulation, double clic, **acceptations simultanées** ;
- conflits de planning, séances consécutives ;
- double confirmation, **confirmations simultanées**, transfert unique ;
- litiges, décisions concurrentes de deux administrateurs, restitution ;
- évaluations, portefeuille, notifications, modération, désactivation de comptes.

Pour pointer vers une autre base de test :

```bash
TEST_DATABASE_URL="postgresql://user:pass@host:5432/skillswap_test" npm test
```

---

## API REST

Toutes les routes sont préfixées par `/api`. Les routes privées attendent l'en-tête `Authorization: Bearer <jeton>`.

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/auth/register` · `/auth/login` | public |
| `GET` `PUT` | `/auth/me` | étudiant connecté |
| `PUT` | `/auth/password` | étudiant connecté |
| `GET` | `/categories` | connecté |
| `POST` `PUT` `DELETE` | `/categories/:id` | administrateur |
| `GET` | `/offers` · `/offers/suggestions` · `/offers/mine` · `/offers/:id` | connecté |
| `POST` `PUT` `DELETE` | `/offers` · `/offers/:id` | propriétaire |
| `POST` | `/offers/:id/publish` · `/unpublish` · `/archive` | propriétaire |
| `POST` `DELETE` | `/offers/:id/slots` · `/offers/:id/slots/:slotId` | propriétaire |
| `GET` | `/bookings?box=sent\|received\|all` · `/bookings/planning` · `/bookings/:id` | participant |
| `POST` | `/bookings` | bénéficiaire |
| `POST` | `/bookings/:id/withdraw` · `/accept` · `/refuse` · `/cancel` · `/confirm` | participant concerné |
| `POST` | `/bookings/:id/dispute` · `/bookings/:id/review` | participant concerné |
| `GET` | `/wallet` | connecté |
| `GET` | `/notifications` · `POST /notifications/read-all` · `POST /notifications/:id/read` | connecté |
| `GET` | `/profiles/:id` | connecté |
| `GET` | `/disputes` · `/disputes/:id` · `POST /disputes/:id/comments` | parties et administrateur |
| `GET` | `/admin/stats` · `/admin/users` · `/admin/offers` · `/admin/disputes` · `/admin/bookings` · `/admin/audit` | administrateur |
| `POST` | `/admin/users/:id/active` · `/admin/users/:id/role` | administrateur |
| `POST` | `/admin/offers/:id/hide` · `/unhide` | administrateur |
| `POST` | `/admin/disputes/:id/resolve` · `/admin/bookings/:id/cancel` | administrateur |

Les erreurs renvoient un objet `{ error: { code, message, details? } }` avec un code HTTP explicite (400 validation, 401 non authentifié, 403 interdit, 404 introuvable, 409 conflit métier).

---

## Sécurité

- Mots de passe hachés avec bcrypt (coût 12), jamais renvoyés par l'API.
- Jeton JWT signé côté serveur, expiration configurable, **état du compte revérifié à chaque requête** : un compte désactivé perd immédiatement l'accès.
- Autorisations par rôle appliquées par middleware, espace administrateur inaccessible aux étudiants.
- Validation systématique des entrées avec Zod, côté serveur.
- Requêtes paramétrées via Prisma (pas de concaténation SQL).
- En-têtes de sécurité Helmet, CORS restreint, limitation de débit sur l'authentification.
- Message identique pour un courriel inconnu et un mot de passe erroné (pas d'énumération de comptes).
- Aucun secret versionné : `.env` est ignoré par Git, seul `.env.example` est publié.

---

## Limitations connues

- **Pas de réinitialisation de mot de passe par courriel** : aucun service d'envoi n'étant configuré, un mot de passe oublié doit être réinitialisé par un administrateur en base.
- **Pas d'envoi de notifications hors application** (courriel ou notification push) : les notifications sont internes et consultables depuis l'interface.
- **Pas de téléversement de photo de profil** : les avatars sont générés à partir des initiales.
- Les dates sont affichées en heure de Casablanca ; le stockage est en UTC.
- Le jeu de démonstration crée des séances dans les jours qui suivent le seed : passez la commande `npm run db:seed` sur une base fraîche pour retrouver des créneaux futurs.
