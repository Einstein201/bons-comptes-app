import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { AuthService } from './auth.service.js';
import { LoginDto } from './login.dto.js';


@Controller('auth')
export class AuthController{
  constructor(private readonly authService: AuthService) {
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
) {
   return  this.authService.login(body, response);
  

    
   
 
  }




}