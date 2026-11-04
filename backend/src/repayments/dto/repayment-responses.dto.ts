import { ApiProperty } from '@nestjs/swagger';
import { RepaymentStatus } from '@prisma/client';

export class RepaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  fromUserId: string;

  @ApiProperty({ format: 'uuid' })
  toUserId: string;

  @ApiProperty({
    type: 'integer',
    description: 'Montant en centimes.',
    example: 3160,
  })
  amount: number;

  @ApiProperty({ enum: RepaymentStatus, enumName: 'RepaymentStatus' })
  status: RepaymentStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: string | null;
}

export class RepaymentUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Chloé Martin' })
  name: string;
}

export class RepaymentListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: RepaymentUserDto })
  fromUser: RepaymentUserDto;

  @ApiProperty({ type: RepaymentUserDto })
  toUser: RepaymentUserDto;

  @ApiProperty({
    type: 'integer',
    description: 'Montant en centimes.',
    example: 3160,
  })
  amount: number;

  @ApiProperty({ enum: RepaymentStatus, enumName: 'RepaymentStatus' })
  status: RepaymentStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: string | null;

  @ApiProperty({
    description:
      'Indication d’affichage : l’utilisateur peut confirmer ce remboursement.',
  })
  canConfirm: boolean;

  @ApiProperty({
    description:
      'Indication d’affichage : l’utilisateur peut annuler ce remboursement.',
  })
  canCancel: boolean;
}

export class RepaymentPageDto {
  @ApiProperty({ type: [RepaymentListItemDto] })
  items: RepaymentListItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
