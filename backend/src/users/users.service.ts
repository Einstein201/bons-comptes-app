import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';

const SALT_ROUNDS = 10;

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserInput: CreateUserInput) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserInput.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Cette adresse email est déjà utilisée.');
    }

    const password = await hash(createUserInput.password, SALT_ROUNDS);

    try {
      return await this.prisma.user.create({
        data: {
          email: createUserInput.email,
          name: createUserInput.name,
          password,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (this.isEmailConflict(error)) {
        throw new ConflictException(
          'Cette adresse email est déjà utilisée.',
        );
      }

      throw error;
    }
  }

  private isEmailConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes('email')
      : typeof target === 'string' && target.includes('email');
  }
}
