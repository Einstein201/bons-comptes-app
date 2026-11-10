import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto.js';

const ERROR_NAMES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
} as const;

type ErrorStatus = keyof typeof ERROR_NAMES;

// Exemple : @ApiErrors({ 404: 'Porte-monnaie introuvable.' })
export function ApiErrors(errors: Partial<Record<ErrorStatus, string>>) {
  return applyDecorators(
    ...Object.entries(errors).map(([code, description]) => {
      const status = Number(code) as ErrorStatus;
      return ApiResponse({
        status,
        description,
        type: ErrorResponseDto,
        example: {
          statusCode: status,
          message: description,
          error: ERROR_NAMES[status],
        },
      });
    }),
  );
}

// Routes protégées par JwtAuthGuard : jeton Bearer obligatoire.
export function ApiJwtAuth() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiErrors({ 401: 'Jeton d’accès absent, invalide ou expiré.' }),
  );
}
