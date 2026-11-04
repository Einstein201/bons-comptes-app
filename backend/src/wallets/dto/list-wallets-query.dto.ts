import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../wallet-pagination.js';
import { ApiPropertyOptional } from '@nestjs/swagger';

const MAX_CURSOR_LENGTH = 200;

export class ListWalletsQueryDto {
  // Nombre d'éléments par section (20 par défaut, appliqué par le service).
  @ApiPropertyOptional({
    type: 'integer',
    description: 'Nombre d’éléments par section.',
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Curseur de la section des porte-monnaies ouverts.',
    maxLength: MAX_CURSOR_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  openCursor?: string;

  @ApiPropertyOptional({
    description: 'Curseur de la section des porte-monnaies clôturés.',
    maxLength: MAX_CURSOR_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  closedCursor?: string;

  @ApiPropertyOptional({
    description: 'Curseur de la section des invitations.',
    maxLength: MAX_CURSOR_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  invitationsCursor?: string;
}
