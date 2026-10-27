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
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto.js';
import { ExpensesService } from './expenses.service.js';

@Controller('wallets/:walletId/expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
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
  findAll(
    @Param('walletId') walletId: string,
    @Query() query: ListExpensesQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.expensesService.findAll(walletId, request.user.userId, query);
  }
}
