// Partagé par l'inscription et la connexion : le hachage factice de login doit avoir le même coût.
export const BCRYPT_ROUNDS = 10;
export const REFRESH_COOKIE = 'refreshToken';
// Derrière le proxy du frontend, les routes /auth sont appelées sous /api/auth :
// REFRESH_COOKIE_PATH permet alors au navigateur de renvoyer le cookie.
export const refreshCookieBase = (isProd: boolean) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict' as const,
  path: process.env.REFRESH_COOKIE_PATH || '/auth',
});
export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
