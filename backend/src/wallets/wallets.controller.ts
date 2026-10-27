import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { GetWalletQueryDto } from './dto/get-wallet-query.dto.js';
import { ListWalletsQueryDto } from './dto/list-wallets-query.dto.js';
import { WalletsService } from './wallets.service.js';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  create(
    @Body() createWalletDto: CreateWalletDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.walletsService.create(createWalletDto, request.user.userId);
  }

  @Get()
  findAll(
    @Query() query: ListWalletsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.walletsService.listForUser(request.user.userId, query);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query() query: GetWalletQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.walletsService.findOne(id, request.user.userId, query);
  }
}
