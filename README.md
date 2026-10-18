# Les Bons Comptes

Application de gestion et de partage des dépenses entre amis, développée dans le cadre du module IF.

## Architecture

- [`backend/`](./backend/README.md) : API NestJS, Prisma et PostgreSQL.
- [`frontend/`](./frontend/README.md) : application web Next.js, React et TypeScript.

Les deux applications ont leurs propres dépendances npm et doivent être installées depuis leur dossier respectif.

## Démarrage local

Configurez d'abord PostgreSQL et `backend/.env` selon les instructions du [README backend](./backend/README.md).

Dans un terminal, démarrez l'API :

```bash
cd backend
npm install
npx prisma generate
npm run start:dev
```

Dans un second terminal, démarrez le front-end :

```bash
cd frontend
npm ci
npm run dev
```

- Front-end : [http://localhost:3001](http://localhost:3001)
- API backend : [http://localhost:3000](http://localhost:3000)
