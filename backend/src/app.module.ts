import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ClosureModule } from './closure/closure.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { FinancialModule } from './financial/financial.module.js';
import { MembershipsModule } from './memberships/memberships.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WalletsModule } from './wallets/wallets.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    FinancialModule,
    MembershipsModule,
    WalletsModule,
    ExpensesModule,
    ClosureModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}