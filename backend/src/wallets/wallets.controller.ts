import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
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
}
