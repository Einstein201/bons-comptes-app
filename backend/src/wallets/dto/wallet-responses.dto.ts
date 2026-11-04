import { ApiProperty } from '@nestjs/swagger';
import { WalletMemberStatus, WalletStatus } from '@prisma/client';

export class WalletResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Voyage à Lisbonne' })
  title: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Voyage entre amis au Portugal',
  })
  description: string | null;

  @ApiProperty({ enum: WalletStatus, enumName: 'WalletStatus' })
  status: WalletStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class WalletListItemDto extends WalletResponseDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Date de la dernière action sur le porte-monnaie.',
  })
  updatedAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt: string | null;

  @ApiProperty({ example: 'Élodie Laurent' })
  creatorName: string;

  @ApiProperty({
    description: 'Vrai si l’utilisateur connecté a créé le porte-monnaie.',
  })
  isCreator: boolean;
}

export class WalletInvitationItemDto extends WalletListItemDto {
  @ApiProperty({ format: 'date-time' })
  invitedAt: string;
}

export class WalletListPageDto {
  @ApiProperty({ type: [WalletListItemDto] })
  items: WalletListItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;

  @ApiProperty({
    description: 'Nombre total d’éléments de la section.',
    example: 4,
  })
  total: number;
}

export class WalletInvitationPageDto {
  @ApiProperty({ type: [WalletInvitationItemDto] })
  items: WalletInvitationItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;

  @ApiProperty({ example: 2 })
  total: number;
}

export class WalletListResponseDto {
  @ApiProperty({
    type: WalletListPageDto,
    description: 'Porte-monnaies ouverts dont l’utilisateur est membre.',
  })
  open: WalletListPageDto;

  @ApiProperty({
    type: WalletListPageDto,
    description: 'Porte-monnaies clôturés dont l’utilisateur est membre.',
  })
  closed: WalletListPageDto;

  @ApiProperty({
    type: WalletInvitationPageDto,
    description: 'Invitations en attente.',
  })
  invitations: WalletInvitationPageDto;
}

export class WalletDetailsWalletDto extends WalletResponseDto {
  @ApiProperty()
  isCreator: boolean;
}

export class WalletMemberDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'Élodie Laurent' })
  name: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: WalletMemberStatus, enumName: 'WalletMemberStatus' })
  status: WalletMemberStatus;

  @ApiProperty({ format: 'date-time' })
  invitedAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt: string | null;
}

export class WalletMembersPageDto {
  @ApiProperty({ type: [WalletMemberDto] })
  items: WalletMemberDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor: string | null;
}

export class WalletDetailsResponseDto {
  @ApiProperty({ type: WalletDetailsWalletDto })
  wallet: WalletDetailsWalletDto;

  @ApiProperty({ type: WalletMembersPageDto })
  members: WalletMembersPageDto;
}
