import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_AMOUNT_CENTS } from '../../expenses/dto/create-expense.dto.js';

export class CreateRepaymentDto {
  @IsUUID()
  toUserId: string;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amount: number;
}
