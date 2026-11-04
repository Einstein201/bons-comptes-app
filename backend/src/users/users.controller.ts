import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';
import { ApiTags } from '@nestjs/swagger';
import { ApiJwtAuth } from '../common/swagger/api-docs.decorators.js';

@Controller('users')
@ApiTags('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiJwtAuth()
  @Patch('me')
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
