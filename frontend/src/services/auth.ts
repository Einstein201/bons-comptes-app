import { apiRequest, readAccessToken, refreshSession, setAccessToken } from './api';

export type AuthUser = { userId: string; email: string; name: string };
export type LoginInput = { email: string; password: string };
export type RegisterInput = LoginInput & { name: string };

export async function register(input: RegisterInput): Promise<void> {
  await apiRequest('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, false);
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, false);
  setAccessToken(await readAccessToken(response));
  try {
    return await getCurrentUser();
  } catch (error) {
    setAccessToken(null);
    throw error;
  }
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiRequest('/auth/me');
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' || body === null ||
    !('userId' in body) || typeof body.userId !== 'string' || !body.userId.trim() ||
    !('email' in body) || typeof body.email !== 'string' || !body.email.trim() ||
    !('name' in body) || typeof body.name !== 'string'
  ) {
    throw new Error("La réponse du backend ne contient pas d'utilisateur valide.");
  }
  return { userId: body.userId, email: body.email, name: body.name };
}

export async function restoreSession(): Promise<AuthUser> {
  await refreshSession();
  return getCurrentUser();
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }, false);
  } finally {
    setAccessToken(null);
  }
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const response = await apiRequest('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const token = await readAccessToken(response);
  setAccessToken(token);
}
