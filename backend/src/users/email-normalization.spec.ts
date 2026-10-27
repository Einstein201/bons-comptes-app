import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LoginDto } from '../auth/dto/login.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';

describe('email normalization through the global validation rules', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('lowercases and trims the email on sign-up', async () => {
    await expect(
      pipe.transform(
        { email: '  Alice@Example.COM ', name: 'Alice', password: 'motdepasse123' },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).resolves.toMatchObject({ email: 'alice@example.com' });
  });

  it('lowercases and trims the email on login', async () => {
    await expect(
      pipe.transform(
        { email: '  Alice@Example.COM ', password: 'motdepasse123' },
        { type: 'body', metatype: LoginDto },
      ),
    ).resolves.toMatchObject({ email: 'alice@example.com' });
  });

  it('still rejects an invalid email', async () => {
    await expect(
      pipe.transform(
        { email: 'pas-un-email', name: 'Alice', password: 'motdepasse123' },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).rejects.toThrow();
  });
});
