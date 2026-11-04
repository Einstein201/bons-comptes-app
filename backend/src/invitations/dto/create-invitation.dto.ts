import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email.js';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({
    description:
      'Adresse de la personne à inviter (elle doit avoir un compte).',
    format: 'email',
    example: 'bob@exemple.fr',
  })
  @Transform(normalizeEmail)
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}
