# Les Bons Comptes - Front-end

Application web de **Les Bons Comptes**, construite avec Next.js, React et TypeScript. Ce projet est indépendant du backend NestJS situé à la racine du dépôt.

## Prérequis

- Node.js 22.22.3 ou plus récent
- npm
- Le backend NestJS et PostgreSQL si les fonctionnalités front-end doivent appeler l'API

## Installation et configuration

Depuis ce dossier (`frontend/`), installez les dépendances :

```bash
npm ci
```

Créez le fichier local `.env.local` à partir du modèle :

```bash
cp .env.example .env.local
```

Sous PowerShell, vous pouvez aussi utiliser :

```powershell
Copy-Item .env.example .env.local
```

Vérifiez que `NEXT_PUBLIC_API_URL` pointe vers le backend NestJS. Par défaut, le backend de développement écoute sur `http://localhost:3000`.

## Développement

```bash
npm run dev
```

Le front-end écoute sur [http://localhost:3001](http://localhost:3001). Le backend reste indépendant sur le port 3000.

## Vérifications

```bash
npm run lint
npm run build
npm audit
```

Le lint utilise ESLint 10 et `typescript-eslint`. Une résolution forcée
(`overrides`) de `minimatch` vers la version 11.0.3 corrige l'alerte
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
dans leurs dépendances transitives. Elle pourra être retirée lorsque ces outils
utiliseront une version corrigée sans cette résolution.

Le routage utilise l'App Router dans `src/app/`. Les composants réutilisables seront placés dans `src/components/`, et les appels HTTP vers le backend dans `src/services/`.
