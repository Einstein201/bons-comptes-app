import { IsByteLength, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Mot de passe actuel.',
    maxLength: 72,
    example: 'ancien-mot-de-passe',
  })
  @IsString()
  @IsNotEmpty()
  @IsByteLength(1, 72)
  currentPassword: string;

  @ApiProperty({
    description:
      'Nouveau mot de passe : 8 caractères minimum, 72 octets maximum.',
    minLength: 8,
    maxLength: 72,
    example: 'nouveau-mot-de-passe',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @IsByteLength(1, 72)
  newPassword: string;
}
