import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PAGE_LIMIT } from '../wallet-pagination.js';

const MAX_CURSOR_LENGTH = 200;

export class ListWalletsQueryDto {
  // Nombre d'éléments par section (20 par défaut, appliqué par le service).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  openCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  closedCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  invitationsCursor?: string;
}
