import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email', example: 'alice@exemple.fr' })
  email: string;

  @ApiProperty({ example: 'Alice Martin' })
  name: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
