import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type: NotificationType;

  @ApiProperty({
    example: 'Élodie Laurent vous a invité à Voyage à Lisbonne',
  })
  message: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Porte-monnaie concerné, s’il y en a un.',
  })
  walletId: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '`null` tant que la notification n’est pas lue.',
  })
  readAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;

  @ApiProperty({
    type: 'integer',
    description:
      'Nombre total de notifications non lues, toutes pages confondues.',
    example: 3,
  })
  unreadCount: number;
}

export class MarkAllAsReadResponseDto {
  @ApiProperty({
    type: 'integer',
    description: 'Nombre de notifications passées à « lue ».',
    example: 3,
  })
  updated: number;
}
