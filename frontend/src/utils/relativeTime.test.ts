import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const now = new Date('2026-11-03T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [10_000, "À l'instant"],
    [5 * MINUTE, 'Il y a 5 min'],
    [59 * MINUTE, 'Il y a 59 min'],
    [HOUR, 'Il y a 1 h'],
    [23 * HOUR, 'Il y a 23 h'],
    [DAY, 'Hier'],
    [DAY + 5 * HOUR, 'Hier'],
    [3 * DAY, 'Il y a 3 j'],
    [6 * DAY, 'Il y a 6 j'],
  ])('formats %i ms ago as « %s »', (elapsed, expected) => {
    expect(formatRelativeTime(ago(elapsed), now)).toBe(expected);
  });

  it('falls back to the full date after a week', () => {
    expect(formatRelativeTime(ago(10 * DAY), now)).toBe('24 oct. 2026');
  });

  it("treats a date slightly in the future (clock skew) as « À l'instant »", () => {
    expect(formatRelativeTime(ago(-5_000), now)).toBe("À l'instant");
  });
});
