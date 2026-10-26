import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export const MAX_DESCRIPTION_LENGTH = 1000;

export class CreateWalletDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  title: string;

  // Optionnelle : seule l'absence de la propriété (undefined) dispense de validation.
  // @IsOptional() ignorerait aussi `null`, qui doit être refusé (HTTP 400).
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;
}
