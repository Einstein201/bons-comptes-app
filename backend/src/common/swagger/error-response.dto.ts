import { ApiProperty } from '@nestjs/swagger';

// Format des erreurs renvoyées par NestJS.
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({
    description: 'Un message, ou la liste des erreurs de validation (400).',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Porte-monnaie introuvable.',
  })
  message: string | string[];

  @ApiProperty({ example: 'Not Found' })
  error: string;
}
