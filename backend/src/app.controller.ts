import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
