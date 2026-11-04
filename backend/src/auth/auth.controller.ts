import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request.js';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/auth.guard.js';
import { REFRESH_COOKIE } from './auth.constants.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import {
  AccessTokenResponseDto,
  ChangePasswordResponseDto,
  CurrentUserResponseDto,
  MessageResponseDto,
} from './dto/auth-responses.dto.js';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Se connecter',
    description:
      'Renvoie un jeton d’accès et dépose le cookie de rafraîchissement.',
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiErrors({
    400: 'Adresse email ou mot de passe mal formé.',
    401: 'Identifiants incorrects.',
  })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(body);
    this.authService.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('refresh')
  @ApiCookieAuth()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Renouveler le jeton d’accès',
    description: 'Lit le cookie de rafraîchissement et en dépose un nouveau.',
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiErrors({ 401: 'Cookie de rafraîchissement absent, invalide ou expiré.' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.refresh(
      req.cookies?.[REFRESH_COOKIE],
    );
    this.authService.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @ApiCookieAuth()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Se déconnecter',
    description: 'Supprime le cookie de rafraîchissement.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  @UseGuards(JwtAuthGuard)
  @ApiJwtAuth()
  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Changer son mot de passe',
    description:
      'Renvoie un nouveau jeton d’accès et dépose un nouveau cookie.',
  })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiErrors({ 400: 'Données invalides ou mot de passe actuel incorrect.' })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, message } =
      await this.authService.changePassword(req.user.userId, body);
    this.authService.setRefreshCookie(res, refreshToken);
    return { accessToken, message };
  }

  @UseGuards(JwtAuthGuard)
  @ApiJwtAuth()
  @Get('me')
  @ApiOperation({ summary: 'Utilisateur connecté' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  me(@Req() req: Request & { user: { userId: string } }) {
    return this.authService.me(req.user.userId);
  }
}
