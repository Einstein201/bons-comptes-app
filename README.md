# Les Bons Comptes — Backend (NestJS + Prisma)

Application full-stack de gestion et de partage de dépenses entre amis et portefeuilles partagés, développée dans le cadre du module **IFI**.

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

- [Node.js](https://nodejs.org/) (v18+ recommandé)
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

Créez un fichier `.env` à la racine du projet et ajoutez-y la chaîne de connexion à la base de données PostgreSQL partagée :

```env
DATABASE_URL="postgresql://utilisateur:motdepasse@hote:5432/bons_comptes?schema=public"
PORT=3000
```

### 4. Générer le client Prisma

```bash
npx prisma generate
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

## 👥 Équipe

- Einstein
- Phong Lan
- Marie Changlais
- Fanomezantsoa
