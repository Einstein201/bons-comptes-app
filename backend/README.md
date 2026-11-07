# Les Bons Comptes — Backend (NestJS + Prisma)

Application full-stack de gestion et de partage de dépenses entre amis et portefeuilles partagés, développée dans le cadre du module **IF**.

---

## Stack technique

- **Framework backend :** NestJS (TypeScript, NodeNext)
- **ORM :** Prisma ORM
- **Base de données :** PostgreSQL (base de données partagée)
- **Tests :** Vitest
- **Gestionnaire de paquets :** npm
- **Version minimale de Node.js :** 22.22.3

---

##  Prérequis

Avant de commencer, assurez-vous d'avoir installé sur votre machine :

- [Node.js](https://nodejs.org/) (v22.22.3 ou plus récent)
- [npm](https://www.npmjs.com/) (fourni avec Node.js)
- [Git](https://git-scm.com/)

---

##  Installation et configuration locale

### 1. Cloner le dépôt et se placer dans le dossier backend

```bash
git clone https://github.com/Einstein201/bons-comptes-app.git
cd bons-comptes-app
git checkout dev
cd backend
```

### 2. Installer les dépendances

```bash
npm ci
```

### 3. Configurer les variables d'environnement

Créez un fichier `.env` dans le dossier `backend/` et configurez les variables suivantes avec les paramètres de votre base de données PostgreSQL. Les valeurs ci-dessous sont des exemples fictifs :

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/bons_comptes?schema=public"
PORT=3000
```

Le fichier `.env.example` contient une URL locale fictive pour démarrer; remplacez-la par la configuration de votre environnement.

### Base partagée avec Neon

Le groupe utilise la branche Neon `dev`; `production` est réservée à la production. Demandez au responsable du projet de vous inviter et de transmettre les URL de connexion par un canal privé. Ne partagez pas le compte propriétaire.

Dans votre fichier local `backend/.env` (non commité), configurez `DATABASE_URL` pour l'application et `DATABASE_URL_UNPOOLED` pour les migrations Prisma. Ces deux URL doivent cibler la branche Neon `dev`; `DATABASE_URL_UNPOOLED` doit être une URL de connexion directe. Configurez également `PORT`, `JWT_SECRET` et `JWT_REFRESH_SECRET`. Ne partagez pas ces valeurs publiquement et utilisez uniquement des données fictives.

Depuis `backend/`, générez le client avec `npx prisma generate`. Le responsable vérifie que la configuration cible `dev`, puis applique les migrations avec `npx prisma migrate deploy` et vérifie avec `npx prisma migrate status`. Ne lancez pas de migration sur `production`. IF-3 refuse volontairement les anciennes données de portefeuille ou de dépense, faute de créateur et de date métier fiables.


## Configuration JWT

Générez deux secrets distincts avec cette commande, une fois pour chaque variable :

```bash
openssl rand -hex 32
```

Ajoutez-les à `backend/.env` :

```env
JWT_SECRET=your_generated_secret
JWT_REFRESH_SECRET=your_generated_refresh_secret
```

`JWT_SECRET` signe les jetons d'accès. `JWT_REFRESH_SECRET` signe et vérifie les jetons de renouvellement.

Limite connue : les jetons de renouvellement individuels ne sont pas stockés côté serveur. `POST /auth/refresh` émet un nouveau jeton sans invalider l'ancien, qui reste réutilisable jusqu'à son expiration (7 jours). `POST /auth/logout` efface le cookie du navigateur, mais ne révoque pas une copie du jeton. Un changement de mot de passe invalide les anciens jetons de renouvellement. La révocation dédiée à la déconnexion (`jti`) reste à implémenter.
Ne commitez pas `.env` et ne partagez pas les secrets.

## Documentation de l'API (Swagger)

La documentation OpenAPI est générée à partir du code avec `@nestjs/swagger`.

- Interface : `http://localhost:3000/api/docs`
- Document JSON : `http://localhost:3000/api/docs-json`

Elle n'est servie que si `SWAGGER_ENABLED=true` dans `backend/.env`, et jamais lorsque `NODE_ENV=production`.

Pour appeler une route protégée depuis l'interface : exécuter `POST /auth/login`, copier l'`accessToken` reçu, cliquer sur **Authorize** et le coller dans le champ `bearer`.

Pour documenter une nouvelle route : `@ApiOperation` pour le résumé, `@ApiOkResponse` ou `@ApiCreatedResponse` pour la réponse, `@ApiErrors` (`src/common/swagger/api-docs.decorators.ts`) pour les erreurs, et `@ApiProperty` sur chaque champ des DTO. `src/swagger.spec.ts` vérifie que chaque route a un résumé, une réponse documentée et la bonne authentification.

## Aperçu des routes

Ce README présente les principaux parcours de l'API. Pour le détail des paramètres,
permissions, réponses et erreurs, consultez [la documentation Swagger](http://localhost:3000/api/docs),
disponible lorsque `SWAGGER_ENABLED=true` et que le backend est démarré.

- **Authentification et comptes :** `POST /users`, `POST /auth/login`,
  `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`,
  `GET /auth/me`, `PATCH /users/me`.
- **Porte-monnaies et bilan :** `POST /wallets`, `GET /wallets`,
  `GET /wallets/:id`, `POST /wallets/:id/close`,
  `GET /wallets/:id/balance`, `GET /wallets/:id/optimized-payments`.
- **Dépenses :** `GET` et `POST /wallets/:walletId/expenses`,
  `PATCH` et `DELETE /wallets/:walletId/expenses/:id`.
- **Invitations :** `POST /wallets/:walletId/invitations`,
  `GET /invitations`, `POST /invitations/:id/accept`,
  `POST /invitations/:id/decline`,
  `DELETE /wallets/:walletId/invitations/:id`.
- **Membres :** `DELETE /wallets/:walletId/members/me` et
  `DELETE /wallets/:walletId/members/:userId`.
- **Remboursements :** `GET` et `POST /wallets/:walletId/repayments`,
  `POST /wallets/:walletId/repayments/:repaymentId/confirm` et
  `POST /wallets/:walletId/repayments/:repaymentId/cancel`.
- **Notifications :** `GET /notifications`, `POST /notifications/read-all`,
  `POST /notifications/:id/read`.

## API utilisateurs

La route `POST /users` crée un compte. Elle attend un courriel valide, un nom de 1 à 100 caractères et un mot de passe d'au moins 8 caractères (maximum 72 octets pour le hachage bcrypt). Les propriétés inattendues sont rejetées.


## API porte-monnaies

`GET /wallets` (jeton d'accès requis, sinon 401) liste les porte-monnaies de l'utilisateur identifié par son jeton, jamais d'un identifiant fourni par le client. La réponse contient trois sections, chacune paginée indépendamment par curseur :

- `open` : porte-monnaies ouverts dont l'utilisateur est membre, du plus récent au plus ancien (`createdAt`) ;
- `closed` : porte-monnaies clos dont l'utilisateur est membre, triés de la même façon ;
- `invitations` : invitations en attente vers un porte-monnaie ouvert, de la plus récente à la plus ancienne (`invitedAt`). Les invitations vers un porte-monnaie clos ne sont pas retournées.

```json
{
  "open": { "items": [], "nextCursor": null, "total": 0 },
  "closed": { "items": [], "nextCursor": null, "total": 0 },
  "invitations": { "items": [], "nextCursor": null, "total": 0 }
}
```

`total` est le nombre de porte-monnaies de la section, quels que soient la limite et le curseur (compteurs des onglets, nombre de pages : `ceil(total / limit)`).

Chaque élément expose `id`, `title`, `description`, `status`, `createdAt`, `updatedAt`, `closedAt`, `creatorName` (nom du créateur, jamais son courriel ni son identifiant) et `isCreator` ; une invitation ajoute `invitationId` (identifiant de l'adhésion à utiliser pour y répondre) et `invitedAt`.

- `isCreator` vaut `true` quand l'utilisateur est le créateur du porte-monnaie. Il sert à l'interface pour afficher « Vous » et les actions réservées au créateur, comme inviter, clôturer ou retirer un membre. Tout membre peut ajouter une dépense dans un porte-monnaie ouvert ; seul son payeur peut la modifier ou la supprimer. Les actions de remboursement dépendent du rôle du membre et du statut du remboursement. L'interface ne remplace jamais les contrôles de droits côté serveur.
- `updatedAt` est la date de la dernière action sur le porte-monnaie. Chaque action (ouverture, clôture, dépense, demande de remboursement, remboursement...) doit rafraîchir `Wallet.updatedAt` dans la même transaction : Prisma ne le fait seul que lorsque la ligne du porte-monnaie elle-même est modifiée.

Paramètres de requête : `limit` (de 1 à 100, 20 par défaut, appliqué à chaque section) et un curseur par section : `openCursor`, `closedCursor`, `invitationsCursor`. Quand `nextCursor` n'est pas `null`, il se passe tel quel dans le paramètre de la section concernée pour obtenir la page suivante, sans modifier les autres sections. Un curseur invalide, une limite hors bornes ou un paramètre inattendu répondent 400.

La pagination par curseur ne permet pas de sauter à une page donnée : l'interface propose « Précédent / Suivant » (elle garde les curseurs déjà parcourus) et peut afficher « Page 2 sur 3 » grâce à `total`.

Une migration ajoute l'index `WalletMember(userId, status)` utilisé par ces requêtes.

### Détail d'un porte-monnaie

`GET /wallets/:id` nécessite un jeton d'accès et une adhésion `MEMBER`. La réponse contient `wallet` (`id`, `title`, `description`, `status`, `createdAt`, `isCreator`) et `members` (`items`, `nextCursor`).

`wallet.isCreator` indique si l'utilisateur authentifié est le créateur, sans exposer `createdById`. L'interface peut ainsi afficher l'action de clôture uniquement pour le créateur d'un porte-monnaie `OPEN`. Ce champ ne remplace pas le contrôle des droits effectué par `POST /wallets/:id/close`.

### Modification d'une dépense

`PATCH /wallets/:walletId/expenses/:id` nécessite un jeton d'accès et
accepte un ou deux champs : `title` (chaîne non vide de 100 caractères maximum)
et `amount` (entier positif en centimes). Seul le payeur peut modifier une
dépense d'un porte-monnaie ouvert. `date` représente le jour de l'achat et ne
peut pas être modifiée par cette route; `paidById` et `createdById` ne sont pas
acceptés. Un changement de montant est refusé avec HTTP 409 si la dépense a des
parts (`ExpenseSplit`), ce qui est le cas de toute dépense : à la création, son
montant est réparti à parts égales entre les membres du moment, les centimes
restants allant aux premiers `userId` par ordre croissant. La réponse contient
la dépense mise à jour et conserve sa date d'achat.

---

##  Exécution de l'application

```bash
# Mode développement avec rechargement automatique
npm run start:dev

# Mode production
npm run build
npm run start:prod
```

L'application sera accessible à l'adresse : `http://localhost:3000`.

---

##  Équipe

- Einstein
- Phong Lan
- Marie Changlais
- Fanomezantsoa
