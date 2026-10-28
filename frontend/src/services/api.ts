function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error('La variable NEXT_PUBLIC_API_URL doit être configurée.');
  }

  return apiUrl;
}

export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[] = []) {
    super(`La requête API a échoué (HTTP ${status}).`);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
  }
}

// NestJS renvoie { message: string | string[], error, statusCode } pour les erreurs HTTP.
async function readErrorMessages(response: Response): Promise<string[]> {
  try {
    const body: unknown = await response.json();
    const message = (body as { message?: unknown } | null)?.message;

    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === 'string');
    }

    if (typeof message === 'string') {
      return [message];
    }
  } catch {
    // Corps absent ou qui n'est pas du JSON : seul le statut HTTP est conservé.
  }

  return [];
}

export async function apiRequest(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const response = await fetch(new URL(path, getApiUrl()), options);

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessages(response));
  }

  return response;
}
