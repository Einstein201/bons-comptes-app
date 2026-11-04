import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../wallet-pagination.js';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetWalletQueryDto {
  @ApiPropertyOptional({
    description: 'Pagination des membres : `nextCursor` de la page précédente.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Nombre de membres par page.',
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = DEFAULT_PAGE_LIMIT;
}
