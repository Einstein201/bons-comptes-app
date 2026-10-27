import { Transform } from 'class-transformer';
import { IsByteLength, IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email.js';

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @IsByteLength(1, 72)
  password: string;
}