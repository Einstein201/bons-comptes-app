import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_AMOUNT_CENTS } from '../../common/amounts.js';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRepaymentDto {
  @ApiProperty({ description: 'Membre remboursé.', format: 'uuid' })
  @IsUUID()
  toUserId: string;

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
}
