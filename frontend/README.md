# Les Bons Comptes - Front-end

Application web de **Les Bons Comptes**, construite avec Next.js, React et TypeScript. Le backend NestJS se trouve dans le dossier voisin `../backend`.

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
npm audit
```

Le lint utilise ESLint 10 et `typescript-eslint`. Une résolution forcée
(`overrides`) de `minimatch` vers la version 11.0.3 corrige l'alerte
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
dans leurs dépendances transitives. Elle pourra être retirée lorsque ces outils
utiliseront une version corrigée sans cette résolution.

Le routage utilise l'App Router dans `src/app/`. Les composants réutilisables se trouvent dans `src/components/`, et les appels HTTP vers le backend dans `src/services/`.

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
configuration CORS. Son cookie utilise `SameSite=Strict`.

Lorsque le navigateur appelle directement le backend, deux domaines sans lien
empêchent le navigateur de renvoyer le cookie `SameSite=Strict`. En ligne, le
proxy `/api` contourne cette limite : le navigateur appelle l'API sur le domaine
du frontend et Next.js relaie ces appels vers le backend.

La configuration des environnements, les déploiements et les vérifications sont
détaillés dans [la procédure de déploiement](../DEPLOYMENT.md).

`GET /auth/me` renvoie actuellement `{ userId, email, name }`. Le frontend s'en
sert pour hydrater les informations du compte connecté.

## Services de clôture et de bilan

Les services utilisent le client API authentifié existant :

- `getWallet(id, { limit, cursor })` : `GET /wallets/:id`, détail et membres paginés. Le backend doit exposer `wallet.isCreator`.
- `closeWallet(id)` : `POST /wallets/:id/close`, sans corps; retourne le portefeuille `CLOSED` avec ses dates.
- `getWalletBalance(id)` : `GET /wallets/:id/balance`, retourne `walletId`, `totalAmount`, `balances` et `transfers`.
- `getOptimizedPayments(id)` : `GET /wallets/:id/optimized-payments`, retourne `walletId` et `transfers`.

Tous les montants restent des entiers en centimes dans les services. Un solde peut être négatif.
Les virements du bilan correspondent au reste à régler après les remboursements `PAID`.
Le plan optimisé distingue `initialAmount`, `remainingAmount` (après `PAID`) et
`declarableAmount` (après `PAID` et `PENDING`). Un montant déclarable nul ne signifie
donc pas nécessairement que le virement est réglé.

Les réponses mal formées, les montants non entiers ou hors de la plage des entiers
sûrs, et les réponses destinées à un autre portefeuille sont rejetés explicitement.
Les erreurs HTTP et réseau sont propagées, sans bilan de secours.
Le backend réserve la clôture au créateur et les consultations financières aux
membres acceptés d'un portefeuille fermé.

### Écran de clôture et de bilan

La page protégée `/wallets/[id]` charge d'abord le détail. Seul le créateur d'un
porte-monnaie ouvert voit l'action de clôture, suivie d'une confirmation.
Après clôture, le détail et les deux routes financières sont rechargés.
Le bilan et les virements sont affichés ensemble uniquement si leurs réponses
sont cohérentes; une erreur masque le bilan et permet de réessayer.
Les virements doivent correspondre au reste à régler de chaque membre; un plan
vide n'est présenté comme réglé que si tous les soldes sont nuls.

Les montants sont affichés en euros (`EUR`, locale `fr-FR`), à partir des centimes.
Les soldes signés, le reste à régler et le montant encore déclarable ont des
libellés distincts. Le bouton « Actualiser » recharge les données sans conserver
un ancien bilan comme valide en cas d'échec.

Pour une vérification manuelle, ouvrir `/wallets/ID_DU_PORTEFEUILLE` avec un
portefeuille de test : vérifier la confirmation annulable du créateur, l'absence
de l'action pour un autre membre, puis le rechargement du bilan après clôture.
Vérifier également les montants distincts lorsqu'un remboursement est en attente,
un portefeuille sans dépense et le masquage du bilan après un échec d'actualisation.

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

Le backend renvoie `{ userId, email, name }` pour `GET /auth/me`. L'en-tête
affiche le nom du compte; son courriel est consultable dans les informations du
compte.
La déconnexion efface toujours le token en mémoire. Si le serveur ne confirme
pas l'opération, l'interface indique que la révocation serveur n'a pas été
confirmée.

## Déploiement

La démo est hébergée sur Vercel (frontend) et Google Cloud Run (backend).

### Configuration

Les valeurs en ligne sont définies dans Vercel et dans Cloud Run, jamais dans le
dépôt. En local, gardez la configuration habituelle.

| Variable | Application | En local | En ligne |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:3000` | `/api` |
| `API_PROXY_TARGET` | frontend | non définie (proxy désactivé) | `https://<service>.run.app` (adresse du backend Cloud Run) |
| `REFRESH_COOKIE_PATH` | backend | non définie (chemin par défaut `/auth`) | `/api/auth` |

`NEXT_PUBLIC_API_URL=/api` fait appeler l'API sur le domaine du frontend.
`API_PROXY_TARGET` active, dans `next.config.ts`, la règle qui relaie `/api/*`
vers le backend. `REFRESH_COOKIE_PATH=/api/auth` fait correspondre le chemin du
cookie de session aux adresses vues par le navigateur derrière le proxy.

### Mettre en ligne

Depuis `frontend/`, avec un `git status` propre :

```bash
npx vercel deploy --prod
```

Une variable `NEXT_PUBLIC_` est intégrée au moment du build : après l'avoir
modifiée dans Vercel, il faut redéployer. Le dossier `.vercel/` et le fichier
`.env.local` créés par Vercel ne doivent pas être commités.

### Vérification après déploiement

Sur l'adresse en ligne, avec un compte de test :

1. Se connecter.
2. Recharger la page : l'utilisateur reste connecté.
3. Changer son mot de passe, puis recharger la page : l'utilisateur reste
   connecté (le backend dépose un nouveau cookie de session).
4. Se déconnecter, puis recharger la page : l'utilisateur reste déconnecté et
   est redirigé vers la page de connexion.

Si l'étape 2 ou 3 déconnecte l'utilisateur, vérifier `NEXT_PUBLIC_API_URL`,
`API_PROXY_TARGET` et `REFRESH_COOKIE_PATH`. Si l'étape 4 le laisse connecté, le
cookie n'a pas été effacé : vérifier `REFRESH_COOKIE_PATH`.
