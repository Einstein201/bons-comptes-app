import { ApiProperty } from '@nestjs/swagger';
import { WalletStatus } from '@prisma/client';

export class InvitationWalletDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Voyage à Lisbonne' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ enum: WalletStatus, enumName: 'WalletStatus' })
  status: WalletStatus;
}

export class InvitationResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Identifiant de l’invitation.' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  invitedAt: string;

  @ApiProperty({ type: InvitationWalletDto })
  wallet: InvitationWalletDto;
}

export class InvitationPageDto {
  @ApiProperty({ type: [InvitationResponseDto] })
  data: InvitationResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class AcceptedInvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'MEMBER' })
  status: 'MEMBER';
}
