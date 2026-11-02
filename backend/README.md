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

Dans votre fichier local `backend/.env` (non commité), configurez `DATABASE_URL` (connexion de l’application), `DATABASE_URL_UNPOOLED` (migrations Prisma), `NEON_BRANCH=dev`, `PORT` et `JWT_SECRET`. Ne partagez pas ces valeurs publiquement et utilisez uniquement des données fictives.

Depuis `backend/`, générez le client avec `npx prisma generate`. Le responsable vérifie que la configuration cible `dev`, puis applique les migrations avec `npx prisma migrate deploy` et vérifie avec `npx prisma migrate status`. Ne lancez pas de migration sur `production`. IF-3 refuse volontairement les anciennes données de portefeuille ou de dépense, faute de créateur et de date métier fiables.


## JWT configuration

Generate a JWT secret:

```bash
openssl rand -hex 32
```

Add the generated value to `backend/.env`:

```env
JWT_SECRET=your_generated_secret
JWT_REFRESH_SECRET=your_generated_refresh_secret
```

The backend uses this secret to sign and verify JWTs.

Limite connue : les refresh tokens ne sont pas stockés côté serveur. `POST /auth/refresh` émet un nouveau jeton mais l'ancien reste valide jusqu'à son expiration (7 jours), et `POST /auth/logout` ne fait qu'effacer le cookie. La révocation (`jti`) est prévue dans un billet de suivi.
Do not commit `.env` or share the secret.


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

Chaque élément expose `id`, `title`, `description`, `status`, `createdAt`, `updatedAt`, `closedAt`, `creatorName` (nom du créateur, jamais son courriel ni son identifiant) et `isCreator` ; une invitation ajoute `invitedAt`.

- `isCreator` vaut `true` quand l'utilisateur est le créateur du porte-monnaie. Il sert à l'interface (afficher « Vous », montrer ou masquer les actions réservées au créateur : ajouter une dépense, demander un remboursement, répartir). Les droits restent vérifiés côté serveur par chaque route concernée : les autres membres ne peuvent que rembourser.
- `updatedAt` est la date de la dernière action sur le porte-monnaie. Chaque action (ouverture, clôture, dépense, demande de remboursement, remboursement...) doit rafraîchir `Wallet.updatedAt` dans la même transaction : Prisma ne le fait seul que lorsque la ligne du porte-monnaie elle-même est modifiée.

Paramètres de requête : `limit` (de 1 à 100, 20 par défaut, appliqué à chaque section) et un curseur par section : `openCursor`, `closedCursor`, `invitationsCursor`. Quand `nextCursor` n'est pas `null`, il se passe tel quel dans le paramètre de la section concernée pour obtenir la page suivante, sans modifier les autres sections. Un curseur invalide, une limite hors bornes ou un paramètre inattendu répondent 400.

La pagination par curseur ne permet pas de sauter à une page donnée : l'interface propose « Précédent / Suivant » (elle garde les curseurs déjà parcourus) et peut afficher « Page 2 sur 3 » grâce à `total`.

Une migration ajoute l'index `WalletMember(userId, status)` utilisé par ces requêtes.

### Détail d'un porte-monnaie

`GET /wallets/:id` nécessite un jeton d'accès et une adhésion `MEMBER`. La réponse contient `wallet` (`id`, `title`, `description`, `status`, `createdAt`, `isCreator`) et `members` (`items`, `nextCursor`).

`wallet.isCreator` indique si l'utilisateur authentifié est le créateur, sans exposer `createdById`. L'interface peut ainsi afficher l'action de clôture uniquement pour le créateur d'un porte-monnaie `OPEN`. Ce champ ne remplace pas le contrôle des droits effectué par `POST /wallets/:id/close`.

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
