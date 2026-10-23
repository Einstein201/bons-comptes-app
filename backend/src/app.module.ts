import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { FinancialModule } from './financial/financial.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [PrismaModule, UsersModule, FinancialModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
