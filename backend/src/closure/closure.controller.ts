import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { ClosureService } from './closure.service.js';

@Controller('wallets/:id')
@UseGuards(JwtAuthGuard)
export class ClosureController {
  constructor(private readonly closureService: ClosureService) {}

  @Post('close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.closureService.close(id, request.user.userId);
  }

  @Get('balance')
  getBalance(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.closureService.getBalance(id, request.user.userId);
  }

  @Get('optimized-payments')
  getOptimizedPayments(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.closureService.getOptimizedPayments(id, request.user.userId);
  }
}
