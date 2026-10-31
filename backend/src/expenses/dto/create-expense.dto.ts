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


export class CreateExpenseDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  title: string;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amount: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  date: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  paidById?: string;
}
