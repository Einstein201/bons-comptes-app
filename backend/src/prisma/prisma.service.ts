import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Neon peut être lent à répondre (réveil, latence) : les valeurs par défaut (2 s / 5 s) provoquent des P2028.
    super({ transactionOptions: { maxWait: 10000, timeout: 15000 } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}