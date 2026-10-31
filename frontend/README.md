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
npm test
npm run build
```

Le routage utilise l'App Router dans `src/app/`. Les composants réutilisables seront placés dans `src/components/`, et les appels HTTP vers le backend dans `src/services/`.

## Client API et session

Les appels `apiRequest` sont authentifiés par défaut : le token d'accès est
conservé uniquement en mémoire et ajouté à l'en-tête `Authorization`.
Les appels publics (inscription, connexion, refresh et logout) désactivent
explicitement cette authentification.

Un rejet HTTP 401 déclenche un seul renouvellement, partagé entre les requêtes
concurrentes, puis une seule nouvelle tentative. Les erreurs réseau sont
propagées et ne sont pas assimilées à une session expirée.
La connexion, le renouvellement et la déconnexion utilisent `credentials: 'include'`.
Le refresh token reste dans le cookie HTTP-only du backend, sans stockage local.
Le backend doit autoriser l'origine du frontend et les cookies dans sa
configuration CORS. Son cookie utilise `SameSite=Strict` : les deux applications
doivent être sur le même site (par exemple deux sous-domaines du même domaine,
ou `localhost` avec des ports différents). Deux domaines sans lien ne
permettront pas la restauration de session avec cette configuration.

`GET /auth/me` renvoie actuellement `{ userId }`, sans nom ni email.

## Parcours d'authentification

Les pages `/register` et `/login` utilisent les routes `POST /users`,
`POST /auth/login` et `GET /auth/me`. Après inscription, l'utilisateur se
connecte avec ses identifiants. Le formulaire de connexion accepte un chemin
interne `next` pour revenir à la page protégée demandée; les destinations
externes sont refusées.

Le fournisseur React restaure la session au montage de l'application. Les pages
protégées affichent un état de vérification avant d'exposer leur contenu et
redirigent un visiteur vers la connexion. En cas d'indisponibilité réseau, elles
proposent de réessayer au lieu de déclarer la session invalide.

Le backend renvoie uniquement `{ userId }` pour `GET /auth/me`; l'en-tête
affiche donc les actions de compte sans inventer de nom ou d'adresse email.
La déconnexion efface toujours le token en mémoire. Si le serveur ne confirme
pas l'opération, l'interface indique que la révocation serveur n'a pas été
confirmée.
