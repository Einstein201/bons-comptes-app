import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { ExpensesService } from './expenses.service.js';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import {
  ExpensePageDto,
  ExpenseResponseDto,
} from './dto/expense-responses.dto.js';

@Controller('wallets/:walletId/expenses')
@ApiTags('expenses')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({
    summary: 'Ajouter une dépense',
    description:
      'Le payeur est l’utilisateur connecté, sauf si `paidById` désigne un autre membre.',
  })
  @ApiCreatedResponse({ type: ExpenseResponseDto })
  @ApiErrors({
    400: 'Données invalides.',
    403: 'L’utilisateur ou le payeur n’est pas membre du porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
    409: 'Le porte-monnaie est clôturé.',
  })
  create(
    @Param('walletId') walletId: string,
    @Body() createExpenseDto: CreateExpenseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.expensesService.create(
      walletId,
      request.user.userId,
      createExpenseDto,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les dépenses',
    description:
      'De la plus récente à la plus ancienne, avec le total de tout le porte-monnaie.',
  })
  @ApiOkResponse({ type: ExpensePageDto })
  @ApiErrors({
    400: 'Paramètres ou curseur invalides.',
    403: 'L’utilisateur n’est pas membre du porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
  })
  findAll(
    @Param('walletId') walletId: string,
    @Query() query: ListExpensesQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.expensesService.findAll(walletId, request.user.userId, query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une dépense' })
  @ApiNoContentResponse({ description: 'Dépense supprimée.' })
  @ApiErrors({
    403: 'Seul le payeur peut supprimer cette dépense.',
    404: 'Porte-monnaie ou dépense introuvable.',
    409: 'Le porte-monnaie est clôturé.',
  })
  remove(
    @Param('walletId') walletId: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.expensesService.remove(walletId, id, request.user.userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier une dépense',
    description: 'Seuls le titre et le montant sont modifiables.',
  })
  @ApiOkResponse({ type: ExpenseResponseDto })
  @ApiErrors({
    400: 'Aucun champ fourni, ou données invalides.',
    403: 'Seul le payeur peut modifier cette dépense.',
    404: 'Porte-monnaie ou dépense introuvable.',
    409: 'Le porte-monnaie est clôturé, ou le montant ne peut plus changer car la dépense a déjà une répartition.',
  })
  update(
    @Param('walletId') walletId: string,
    @Param('id') id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.expensesService.update(
      walletId,
      id,
      request.user.userId,
      updateExpenseDto,
    );
  }
}
