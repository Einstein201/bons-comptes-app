import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { REFRESH_COOKIE } from './auth/auth.constants.js';

export const SWAGGER_PATH = 'api/docs';

const DESCRIPTION = [
  'API de **Les bons comptes**.',
  '',
  '- **Montants** : entiers en centimes (`4599` = 45,99 €).',
  '- **Dates de dépense** : format `AAAA-MM-JJ`.',
  '- **Pagination** : par curseur opaque. `limit` vaut 20 par défaut et 100 au maximum ; renvoyez le `nextCursor` reçu pour obtenir la page suivante (`null` = dernière page).',
  '- **Authentification** : jeton d’accès dans l’en-tête `Authorization: Bearer …`, obtenu avec `POST /auth/login`. Le jeton de rafraîchissement est un cookie HTTP-only utilisé par `/auth/refresh` et `/auth/logout`.',
].join('\n');

// Jamais en production ; ailleurs, seulement si SWAGGER_ENABLED=true.
export function isSwaggerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.SWAGGER_ENABLED === 'true' && env.NODE_ENV !== 'production';
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Les bons comptes API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(REFRESH_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
  });
}
