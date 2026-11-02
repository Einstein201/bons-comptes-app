import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(100)
  name: string;
}
