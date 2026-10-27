import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../../wallets/wallet-pagination.js';

export class ListInvitationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = DEFAULT_PAGE_LIMIT;

  @IsOptional()
  @IsString()
  cursor?: string;
}
