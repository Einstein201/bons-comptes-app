import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';
import { NotificationsService } from './notifications.service.js';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import {
  MarkAllAsReadResponseDto,
  NotificationPageDto,
  NotificationResponseDto,
} from './dto/notification-responses.dto.js';

@Controller('notifications')
@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lister mes notifications',
    description:
      'De la plus récente à la plus ancienne, avec le nombre total de notifications non lues.',
  })
  @ApiOkResponse({ type: NotificationPageDto })
  @ApiErrors({ 400: 'Paramètres ou curseur invalides.' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.list(request.user.userId, query);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer toutes mes notifications comme lues' })
  @ApiOkResponse({ type: MarkAllAsReadResponseDto })
  markAllAsRead(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(request.user.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marquer une notification comme lue',
    description: 'Sans effet si elle est déjà lue.',
  })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiErrors({ 404: 'Notification introuvable.' })
  markAsRead(
    @Param('id') notificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.markAsRead(
      notificationId,
      request.user.userId,
    );
  }
}
