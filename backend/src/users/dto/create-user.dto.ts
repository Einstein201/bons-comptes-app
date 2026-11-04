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
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ format: 'email', example: 'alice@exemple.fr' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ maxLength: 100, example: 'Alice Martin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: '8 caractères minimum, 72 octets maximum.',
    minLength: 8,
    maxLength: 72,
    example: 'mot-de-passe',
  })
  @IsString()
  @MinLength(8)
  @IsByteLength(1, 72)
  password: string;
}
