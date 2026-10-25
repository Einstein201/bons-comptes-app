export const REFRESH_COOKIE = 'refreshToken';
export const refreshCookieBase = (isProd: boolean) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict' as const,
  path: '/auth',
});
export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;