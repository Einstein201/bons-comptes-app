import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClosureController } from './closure.controller.js';
import { ClosureService } from './closure.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClosureController],
  providers: [ClosureService],
})
export class ClosureModule {}
