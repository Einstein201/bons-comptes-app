import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(100)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
