import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email.js';

export class CreateInvitationDto {
  @Transform(normalizeEmail)
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}
