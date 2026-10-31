import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CreateRepaymentDto } from './dto/create-repayment.dto.js';
import { ListRepaymentsQueryDto } from './dto/list-repayments-query.dto.js';
import { RepaymentsService } from './repayments.service.js';

@Controller('wallets/:walletId/repayments')
@UseGuards(JwtAuthGuard)
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  declare(
    @Param('walletId') walletId: string,
    @Body() createRepaymentDto: CreateRepaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.declare(
      walletId,
      request.user.userId,
      createRepaymentDto,
    );
  }

  @Get()
  findAll(
    @Param('walletId') walletId: string,
    @Query() query: ListRepaymentsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.findAll(walletId, request.user.userId, query);
  }

  @Post(':repaymentId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('walletId') walletId: string,
    @Param('repaymentId') repaymentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.confirm(
      walletId,
      repaymentId,
      request.user.userId,
    );
  }

  @Post(':repaymentId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('walletId') walletId: string,
    @Param('repaymentId') repaymentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.cancel(
      walletId,
      repaymentId,
      request.user.userId,
    );
  }
}
