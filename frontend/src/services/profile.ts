import { apiRequest } from './api';

export async function updateProfile(name: string): Promise<{ name: string }> {
  const response = await apiRequest('/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body: unknown = await response.json();

  if (
    typeof body !== 'object' ||
    body === null ||
    !('name' in body) ||
    typeof body.name !== 'string'
  ) {
    throw new Error("La réponse du profil ne contient pas de nom valide.");
  }

  return { name: body.name };
}
