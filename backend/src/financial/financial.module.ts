import { Module } from '@nestjs/common';
import { FinancialRulesService } from './financial-rules.service.js';

@Module({
  providers: [FinancialRulesService],
  exports: [FinancialRulesService],
})
export class FinancialModule {}
