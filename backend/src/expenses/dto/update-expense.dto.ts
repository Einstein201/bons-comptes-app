import { Transform } from 'class-transformer';
import { MAX_AMOUNT_CENTS } from '../../common/amounts.js';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateExpenseDto {
  @ApiPropertyOptional({
    description:
      'Nouveau libellé. Au moins un des deux champs est obligatoire.',
    maxLength: 100,
    example: 'Billets de train',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Nouveau montant en centimes (4599 = 45,99 €).',
    minimum: 1,
    maximum: MAX_AMOUNT_CENTS,
    example: 4599,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amount?: number;
}
