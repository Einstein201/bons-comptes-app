# Déploiement staging et production

## Choix de plateforme

Le déploiement utilise **Vercel** pour Next.js, **Google Cloud Run** pour
NestJS et **Neon PostgreSQL** pour les données. Ce choix reprend les plateformes
déjà utilisées pour la démo, permet d'héberger les deux applications Node.js et
garde PostgreSQL compatible avec Prisma.

Les offres gratuites conviennent à une démonstration à faible trafic, pas à une
garantie de coût nul ni à une disponibilité de production :

- **Vercel Hobby** est annoncé à 0 $; ses limites d'usage et de collaboration
  s'appliquent. Si le partage d'accès à l'équipe exige une offre payante, ne pas
  la souscrire sans accord de l'équipe.
- **Cloud Run** comprend un quota mensuel gratuit, mais nécessite un compte de
  facturation et facture le dépassement. Cloud Build, Artifact Registry, le
  transfert réseau et les autres services Google peuvent aussi entraîner des
  frais. Les alertes budgétaires avertissent, mais ne plafonnent pas les dépenses.
- **Neon Free** ne coûte pas d'abonnement et impose des quotas de calcul et de
  stockage. L'offre ne fournit pas toutes les garanties de sauvegarde et de
  restauration d'une offre de production.

Consulter les tarifs avant toute mise en ligne :
[Vercel](https://vercel.com/pricing),
[Cloud Run](https://cloud.google.com/run/pricing) et
[Neon](https://neon.com/pricing). Le budget accepté est l'utilisation des quotas
gratuits avec possibilité de dépassement; aucun achat d'offre payante n'est
autorisé implicitement.

## Isolation des environnements

Créer des ressources distinctes, sans recopier de données de production vers le
staging :

| Environnement | GitHub | Vercel | Cloud Run / GCP | Neon |
| --- | --- | --- | --- | --- |
| Staging | branche `dev`, environnement GitHub `staging` | projet `bons-comptes-staging` | projet GCP de staging, service `bons-comptes-api` | projet et base staging |
| Production | branche `main`, environnement GitHub `production` | projet `bons-comptes-production` | projet GCP de production, service `bons-comptes-api` | projet et base production |

Les noms sont des exemples à adapter aux ressources créées. Garder la branche
Neon `dev` utilisée par les développeurs distincte de ces bases de déploiement.
Le staging ne contient que des comptes et des données fictifs. Toute création,
modification ou vérification fonctionnelle sur la base de production est
interdite.

## Configuration et secrets

### Google Cloud

Dans chaque projet GCP :

1. Activer Cloud Run, Cloud Build, Artifact Registry, Secret Manager et les API
   nécessaires à Workload Identity Federation.
2. Créer le dépôt Docker Artifact Registry `bons-comptes` dans la région choisie :

   ```bash
   gcloud artifacts repositories create bons-comptes --repository-format=docker --location=europe-west1 --project=PROJECT_ID
   ```

3. Créer un compte de service de déploiement lié à GitHub par Workload Identity
   Federation. Restreindre la fédération au dépôt `Einstein201/bons-comptes-app`
   et à la branche concernée (`dev` ou `main`); ne pas créer de clé JSON.
4. Créer un compte de service d'exécution Cloud Run avec accès en lecture aux
   secrets nécessaires.
5. Ajouter dans Secret Manager des secrets distincts par projet :
   `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_SECRET` et
   `JWT_REFRESH_SECRET`. `DATABASE_URL` est l'URL Neon poolée de l'environnement;
   `DATABASE_URL_UNPOOLED` est son URL directe. Générer les deux secrets JWT
   séparément pour chaque environnement.
6. Accorder au compte de déploiement les permissions de déployer Cloud Run, de
   pousser des images, d'utiliser le compte d'exécution et de lire
   `DATABASE_URL_UNPOOLED`. Accorder au compte d'exécution uniquement l'accès en
   lecture aux secrets nécessaires au service. Le compte de service de Cloud
   Build doit pouvoir pousser dans Artifact Registry.

Créer des alertes de budget pour chaque projet GCP et surveiller les quotas
Neon et Vercel. Ces alertes ne bloquent pas les dépenses.

`DATABASE_URL_UNPOOLED` est lu par le workflow pour les migrations et n'est pas
exposé au frontend. Cloud Run reçoit les secrets applicatifs depuis Secret
Manager. `PORT` est fourni par Cloud Run; le backend utilise cette valeur.

### Vercel

Créer un projet Vercel distinct pour chaque environnement. Pour chaque projet,
configurer dans l'environnement **Production** :

| Variable | Staging | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api` | `/api` |
| `API_PROXY_TARGET` | URL du service Cloud Run staging, sans barre finale | URL du service Cloud Run production, sans barre finale |

Les projets Vercel étant séparés, leur domaine `vercel.app` fournit une origine
stable pour chaque environnement. Configurer `FRONTEND_ORIGIN` avec l'origine
exacte de ce domaine (sans chemin ni barre finale).
Les déploiements Git automatiques Vercel doivent être désactivés : seul le
workflow GitHub, après succès de la CI, déploie ces projets.
Vérifier que l'URL staging est accessible aux membres de l'équipe et à
l'enseignant sans leur donner accès aux secrets ou au compte propriétaire.

### Environnements GitHub

Créer les environnements GitHub `staging` et `production`. Dans chacun, ajouter
les variables suivantes avec les valeurs de ses propres ressources :

- `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `GCP_DEPLOYER_SERVICE_ACCOUNT` et `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`;
- `FRONTEND_ORIGIN` et `API_PROXY_TARGET`;
- `VERCEL_SCOPE` et `VERCEL_PROJECT_NAME`;

Ajouter `VERCEL_TOKEN` comme secret GitHub d'environnement. Les clés des secrets
GCP ne sont pas placées dans GitHub : le workflow s'authentifie sans clé JSON et
lit uniquement l'URL directe de migration dans Secret Manager. Cette valeur est
masquée dans les logs.

Inviter les membres de l'équipe dans les comptes des fournisseurs selon le
principe du moindre privilège; ne jamais partager le compte propriétaire. Le
staging doit être accessible par son URL Vercel sans exposer de secrets. Si
l'offre gratuite ne permet pas de partager l'accès requis, arrêter et demander
une décision sur le budget plutôt que de passer à une offre payante.

Dans les variables Actions **du dépôt** (pas celles d'un environnement), créer
`STAGING_DEPLOY_ENABLED` et `PRODUCTION_DEPLOY_ENABLED` avec la valeur `false`.
Mettre `STAGING_DEPLOY_ENABLED=true` seulement après avoir vérifié toutes les
ressources staging. Laisser `PRODUCTION_DEPLOY_ENABLED=false` jusqu'à la
validation explicite décrite plus bas.

Le workflow construit `API_PROXY_TARGET` avec la valeur GitHub de l'environnement;
la garder identique à la valeur de Vercel. Le proxy Next.js expose les routes
backend sous `/api/*`, de sorte que le navigateur reste sur l'origine du frontend
et que le cookie de session puisse utiliser `Path=/api/auth`.

## Build, migrations et déploiement

Le workflow [CI](./.github/workflows/ci.yml) exécute les builds, tests et audits.
Il construit aussi l'image Docker du backend. Les jobs de déploiement dépendent
des deux jobs de CI et ne s'exécutent que pour un `push` sur `dev` ou `main`;
les pull requests ne déploient rien.

### Staging

Après configuration des comptes, variables et secrets ci-dessus, activer
`STAGING_DEPLOY_ENABLED` dans les variables Actions du dépôt. Chaque push
réussi sur `dev` :

1. construit l'image backend et la pousse dans Artifact Registry;
2. applique les migrations à la base Neon staging avec
   `DATABASE_URL_UNPOOLED`, puis vérifie `prisma migrate status`;
3. déploie le backend sur Cloud Run staging et vérifie `GET /health`;
4. construit puis déploie le frontend du projet Vercel staging.

Avant de partager le staging, vérifier l'URL `/api/health`, puis tester avec un
compte fictif : connexion, rechargement en restant connecté, changement de mot
de passe suivi d'un rechargement, déconnexion suivie d'un rechargement. Vérifier
les attributs du cookie en HTTPS : `Secure`, `HttpOnly`, `SameSite=Strict` et
`Path=/api/auth`.

### Promotion en production

Ne pas activer `PRODUCTION_DEPLOY_ENABLED` avant que le staging soit accepté,
que les ressources de production soient distinctes et que la procédure de
restauration de la base soit comprise. Dans GitHub, configurer l'environnement
`production` avec une approbation obligatoire par une personne autorisée et
restreindre son déploiement à `main`. La protection de branche doit également
exiger les checks `Backend build and test` et `Frontend build and lint`.

Après l'approbation d'une PR `dev` vers `main`, le workflow attend l'approbation
de l'environnement `production`. Il construit une image du commit validé,
applique uniquement les migrations de la base Neon production avec sa connexion
directe, vérifie leur état, déploie le backend, vérifie `/health`, puis déploie
le frontend production. Tant que `PRODUCTION_DEPLOY_ENABLED` n'est pas activé,
un push sur `main` n'effectue aucun déploiement de production.

Ne jamais appliquer une migration staging à la base production ni utiliser un
dump de production pour remplir le staging.

## Retour à une version précédente

- **Frontend** : dans le projet Vercel de l'environnement concerné, promouvoir
  le dernier déploiement connu comme fonctionnel depuis la liste des
  déploiements.
- **Backend** : identifier la révision Cloud Run précédente puis lui redonner
  100 % du trafic :

  ```bash
  gcloud run revisions list --service bons-comptes-api --region REGION --project PROJECT_ID
  gcloud run services update-traffic bons-comptes-api --to-revisions REVISION=100 --region REGION --project PROJECT_ID
  ```

- **Base de données** : un retour de version applicative ne défait pas une
  migration. Ne jamais supprimer ni réécrire une migration déjà appliquée.
  Préférer des migrations compatibles avec l'ancienne et la nouvelle version,
  puis corriger par une migration en avant. Une restauration de données n'est
  possible que si une sauvegarde/restauration adaptée a été configurée et
  vérifiée pour cet environnement; ne pas supposer que l'offre gratuite le
  garantit.

## État de mise en place

- [x] Plateformes recommandées et limites de coût documentées.
- [x] Workflows de déploiement conditionnés par une CI réussie.
- [x] Déploiement staging automatique après configuration des comptes.
- [x] Déploiement production désactivé par défaut et placé derrière une approbation.
- [x] Retour arrière applicatif décrit; limites de restauration de données explicitées.
- [ ] Comptes, ressources, domaines, secrets et protections GitHub créés par les administrateurs.
- [ ] Déploiement staging réel et tests fonctionnels exécutés.
- [ ] Sauvegarde/restauration de production validée avant activation du déploiement production.
