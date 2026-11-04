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
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import {
  WalletDetailsResponseDto,
  WalletListResponseDto,
  WalletResponseDto,
} from './dto/wallet-responses.dto.js';

@Controller('wallets')
@ApiTags('wallets')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  @ApiOperation({
    summary: 'Créer un porte-monnaie',
    description:
      'L’utilisateur connecté en devient le créateur et le premier membre.',
  })
  @ApiCreatedResponse({ type: WalletResponseDto })
  @ApiErrors({ 400: 'Données invalides.' })
  create(
    @Body() createWalletDto: CreateWalletDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.walletsService.create(createWalletDto, request.user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister mes porte-monnaies et invitations',
    description:
      'Trois sections paginées indépendamment : `open`, `closed` et `invitations`.',
  })
  @ApiOkResponse({ type: WalletListResponseDto })
  @ApiErrors({ 400: 'Paramètres ou curseur invalides.' })
  findAll(
    @Query() query: ListWalletsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.walletsService.listForUser(request.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un porte-monnaie et de ses membres' })
  @ApiOkResponse({ type: WalletDetailsResponseDto })
  @ApiErrors({
    400: 'Paramètres ou curseur invalides.',
    403: 'L’utilisateur n’est pas membre du porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
  })
  findOne(
    @Param('id') id: string,
    @Query() query: GetWalletQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.walletsService.findOne(id, request.user.userId, query);
  }
}
