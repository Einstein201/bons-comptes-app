import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenResponseDto {
  @ApiProperty({
    description: 'Jeton d’accès à envoyer dans l’en-tête Authorization.',
  })
  accessToken: string;
}

export class ChangePasswordResponseDto extends AccessTokenResponseDto {
  @ApiProperty({ example: 'Mot de passe modifié avec succès.' })
  message: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Logout successful' })
  message: string;
}

export class CurrentUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'email', example: 'alice@example.com' })
  email: string;

  @ApiProperty({ example: 'Alice Martin' })
  name: string;
}
