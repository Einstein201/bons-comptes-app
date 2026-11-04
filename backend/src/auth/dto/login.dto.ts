import { Transform } from 'class-transformer';
import { IsByteLength, IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalizeEmail } from '../../common/normalize-email.js';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'alice@exemple.fr' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ maxLength: 72, example: 'mot-de-passe' })
  @IsString()
  @IsNotEmpty()
  @IsByteLength(1, 72)
  password: string;
}
