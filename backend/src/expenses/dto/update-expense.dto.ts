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

export class UpdateExpenseDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amount?: number;
}
