import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { CurrentUserResponseDto } from '../auth/dto/auth-responses.dto.js';

@Controller('users')
@ApiTags('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un compte' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiErrors({
    400: 'Données invalides.',
    409: 'Cette adresse email est déjà utilisée.',
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiJwtAuth()
  @Patch('me')
  @ApiOperation({ summary: 'Modifier son nom' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiErrors({ 400: 'Nom invalide.' })
  updateProfile(
    @Body() updateProfileDto: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.updateProfile(
      request.user.userId,
      updateProfileDto,
    );
  }
}
