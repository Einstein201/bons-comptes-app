import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ maxLength: 100, example: 'Alice Martin' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(100)
  name: string;
}
