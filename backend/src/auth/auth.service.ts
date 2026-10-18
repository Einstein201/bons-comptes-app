
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {LoginDto} from '../auth/dto/login.dto.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
@Injectable()
export class AuthService {
constructor(
    private readonly prisma: PrismaService,

    private readonly jwtService: JwtService,

) {}
async validateUser(plainTextPassword: string, storedHash: string): Promise<boolean> {
    const isMatch = await bcrypt.compare(plainTextPassword, storedHash);
    return isMatch;
  }
async login(dto: LoginDto, response: any) {
  const user = await this.prisma.user.findUnique({
    where: {
      email: dto.email,
    },
  });
  if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');

  }
  if(!await this.validateUser(dto.password, user.password)) {
     throw new UnauthorizedException('Email ou mot de passe incorrect');

  }
    const accessToken = this.jwtService.sign({ userId: user.id }, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign({ userId: user.id }, { expiresIn: '7d' });

    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });

    return { accessToken };


}

async logout(response: any) {
    response.clearCookie('refreshToken');
    return { message: 'Logout successful' };
  }
}
