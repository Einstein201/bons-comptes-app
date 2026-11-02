import { IsByteLength, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @IsByteLength(1, 72)
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @IsByteLength(1, 72)
  newPassword: string;
}
