##  Contexte & ticket Jira

- **Ticket(s) associé(s) :** <!-- Ex. IF-18 / Sprint 2 -->
- **Objectif :** <!-- Résumer brièvement la valeur ajoutée de cette PR. -->

##  Changements apportés

- [ ] **Frontend (Next.js) :** pages, composants, services ou styles modifiés/ajoutés.
- [ ] **Backend (NestJS) :** modules, contrôleurs, services ou DTOs modifiés/ajoutés.
- [ ] **Base de données (Prisma/PostgreSQL) :** changements de schéma et nouvelle migration, si nécessaire. Aucune migration déjà partagée n'a été réécrite.
- [ ] **Sécurité & règles métier :** authentification JWT, guards, rôles, statuts (`OPEN`/`CLOSED`) et validation des entrées concernés.
- [ ] **Documentation/configuration :** documentation mise à jour et variables d'environnement nécessaires documentées sans secret.

<!-- Décrire les changements principaux ou remplacer les éléments ci-dessus par une liste pertinente pour cette PR. -->

##  Conformité du projet

- [ ] Le frontend reste dans Next.js et la logique métier serveur dans NestJS.
- [ ] Les variables sensibles ne sont pas codées en dur ni ajoutées au dépôt.
- [ ] Les changements de base utilisent des migrations Prisma adaptées; aucune commande destructive n'a été appliquée à une base partagée.
- [ ] Les tests et migrations utilisent une base de développement/test, jamais la base de production.

##  Tests & validation

- **Tests unitaires :** <!-- Ex. `cd backend; npm test` — X tests réussis / N/A -->
- **Tests E2E :** <!-- Ex. `cd backend; npm run test:e2e` — X tests réussis / N/A -->
- **Frontend :** <!-- Ex. lint, type-check, build — préciser les commandes et résultats / N/A -->
- **Base de données :** <!-- Ex. `npx prisma validate`, migration testée sur base vierge et/ou avec données existantes / N/A -->
- **CI GitHub Actions :** <!-- lien ou statut des checks -->

##  Plan de test / démonstration

1. <!-- Étapes pour tester la fonctionnalité, les commandes ou les parcours UI. -->
2. <!-- Cas limites vérifiés, selon le périmètre : 400, 401, 403, 404, 409, etc. -->

##  Notes pour la relecture

<!-- Dépendances, décisions à valider, limites connues ou éléments explicitement hors périmètre. Indiquer « Aucune » si sans objet. -->
