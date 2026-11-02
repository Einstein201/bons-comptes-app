import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ChangePasswordDto } from './change-password.dto.js';

describe('ChangePasswordDto', () => {
  it('requires eight characters even when the password uses multi-byte characters', async () => {
    const dto = Object.assign(new ChangePasswordDto(), {
      currentPassword: 'motdepasse',
      newPassword: 'éééé',
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toContain('newPassword');
  });

  it('accepts a password meeting both the character and byte limits', async () => {
    const dto = Object.assign(new ChangePasswordDto(), {
      currentPassword: 'motdepasse',
      newPassword: 'motdepasse',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
