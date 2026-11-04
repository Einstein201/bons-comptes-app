import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const MAX_DESCRIPTION_LENGTH = 1000;

export class CreateWalletDto {
  @ApiProperty({ maxLength: 100, example: 'Voyage à Lisbonne' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  title: string;

  // Optionnelle : seule l'absence de la propriété (undefined) dispense de validation.
  // @IsOptional() ignorerait aussi `null`, qui doit être refusé (HTTP 400).
  @ApiPropertyOptional({
    description: 'Omise si vide ; `null` est refusé.',
    maxLength: MAX_DESCRIPTION_LENGTH,
    example: 'Voyage entre amis au Portugal',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;
}
