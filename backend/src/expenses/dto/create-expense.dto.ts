import { Transform } from 'class-transformer';
import { MAX_AMOUNT_CENTS } from '../../common/amounts.js';
import {
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty({
    description: 'Libellé de la dépense.',
    maxLength: 100,
    example: 'Billets de train',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  title: string;

  @ApiProperty({
    type: 'integer',
    description: 'Montant en centimes (4599 = 45,99 €).',
    minimum: 1,
    maximum: MAX_AMOUNT_CENTS,
    example: 4599,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amount: number;

  @ApiProperty({
    description: 'Date de la dépense (AAAA-MM-JJ).',
    format: 'date',
    example: '2026-10-25',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  date: string;

  @ApiPropertyOptional({
    description:
      'Payeur, membre du porte-monnaie. Par défaut : l’utilisateur connecté.',
    format: 'uuid',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  paidById?: string;
}
