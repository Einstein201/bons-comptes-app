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



## API utilisateurs

La route `POST /users` crée un compte. Elle attend un courriel valide, un nom de 1 à 100 caractères et un mot de passe d'au moins 8 caractères (maximum 72 octets pour le hachage bcrypt). Les propriétés inattendues sont rejetées.

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
