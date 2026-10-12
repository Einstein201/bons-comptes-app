# Les Bons Comptes — Backend (NestJS + Prisma)

Application full-stack de gestion et de partage de dépenses entre amis et portefeuilles partagés, développée dans le cadre du module **IF**.

---

## Stack technique

- **Framework backend :** NestJS (TypeScript, NodeNext)
- **ORM :** Prisma ORM
- **Base de données :** PostgreSQL (base de données partagée)
- **Tests :** Jest
- **Gestionnaire de paquets :** npm

---

##  Prérequis

Avant de commencer, assurez-vous d'avoir installé sur votre machine :

- [Node.js](https://nodejs.org/) (v22 recommandé ; v20 minimum)
- [npm](https://www.npmjs.com/) (fourni avec Node.js)
- [Git](https://git-scm.com/)

---

##  Installation et configuration locale

### 1. Cloner le dépôt et se placer sur la branche `dev`

```bash
git clone https://github.com/Einstein201/bons-comptes-app.git
cd bons-comptes-app
git checkout dev
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet et configurez les variables suivantes avec les paramètres de votre base de données PostgreSQL. Les valeurs ci-dessous sont des exemples fictifs :

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
