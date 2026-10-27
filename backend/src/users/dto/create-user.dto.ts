import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email.js';

export class CreateUserDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(8)
  @IsByteLength(1, 72)
  password: string;
}
