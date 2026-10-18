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
DATABASE_URL="postgresql://utilisateur:motdepasse@localhost:5432/bons_comptes?schema=public"
PORT=3000
```

### 4. Générer le client Prisma

```bash
npx prisma generate
```

### 5. Appliquer les migrations à la base de données

Vérifiez que PostgreSQL est démarré et que `DATABASE_URL` pointe vers la base à initialiser, puis appliquez les migrations du projet :

```bash
npx prisma migrate deploy
```

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
