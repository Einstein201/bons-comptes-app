import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateWalletDto } from './create-wallet.dto.js';

describe('CreateWalletDto', () => {
  it.each([
    ['missing title', {}],
    ['empty title', { title: '' }],
    ['whitespace-only title', { title: '   ' }],
    ['title too long', { title: 'a'.repeat(101) }],
    ['non-string title', { title: 42 }],
    ['non-string description', { title: 'Wallet', description: 42 }],
  ])('rejects %s', async (_case, input) => {
    const dto = Object.assign(new CreateWalletDto(), input);

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a title with an optional description', async () => {
    const dto = Object.assign(new CreateWalletDto(), {
      title: 'Vacances',
      description: 'Dépenses du voyage',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects properties outside the DTO through the global validation rules', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { title: 'Wallet', createdById: 'client-supplied-user' },
        { type: 'body', metatype: CreateWalletDto },
      ),
    ).rejects.toThrow();
  });
});
