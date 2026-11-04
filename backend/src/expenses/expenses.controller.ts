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
import { ApiTags } from '@nestjs/swagger';
import { ApiJwtAuth } from '../common/swagger/api-docs.decorators.js';

@Controller('wallets/:walletId/expenses')
@ApiTags('expenses')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('walletId') walletId: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.expensesService.remove(walletId, id, request.user.userId);
  }

  @Patch(':id')
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
