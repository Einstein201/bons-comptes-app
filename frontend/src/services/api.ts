function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error('La variable NEXT_PUBLIC_API_URL doit être configurée.');
  }

  return apiUrl;
}

export async function apiRequest(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const response = await fetch(new URL(path, getApiUrl()), options);

  if (!response.ok) {
    throw new Error(`La requête API a échoué (HTTP ${response.status}).`);
  }

  return response;
}
