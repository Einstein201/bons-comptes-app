import { IsByteLength, IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @IsByteLength(1, 72)
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @IsByteLength(8, 72)
  newPassword: string;
}
