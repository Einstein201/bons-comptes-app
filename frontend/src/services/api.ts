function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error('La variable NEXT_PUBLIC_API_URL doit être configurée.');
  }

  return apiUrl;
}

let accessToken: string | null = null;
let sessionVersion = 0;
let refreshPromise: Promise<string> | null = null;
const sessionListeners = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  sessionVersion += 1;
  sessionListeners.forEach((listener) => listener());
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function subscribeSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export async function readAccessToken(response: Response): Promise<string> {
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' || body === null ||
    !('accessToken' in body) || typeof body.accessToken !== 'string' ||
    !body.accessToken.trim()
  ) {
    throw new Error("La réponse d'authentification ne contient pas de token valide.");
  }
  return body.accessToken;
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
  authenticated = true,
): Promise<Response> {
  const url = new URL(path, getApiUrl());
  if (url.origin !== new URL(getApiUrl()).origin) {
    throw new Error("Les requêtes API doivent cibler le backend configuré.");
  }

  let token = authenticated ? accessToken ?? await refreshSession() : null;
  const send = () => {
    const headers = new Headers(options?.headers);
    if (authenticated && token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      headers.delete('Authorization');
    }
    return fetch(url, { ...options, headers });
  };

  let response = await send();
  if (authenticated && response.status === 401) {
    // Une autre requête peut avoir renouvelé le token pendant cet appel.
    token = accessToken && accessToken !== token
      ? accessToken
      : await refreshSession();
    response = await send();
    if (response.status === 401) {
      if (accessToken === token) setAccessToken(null);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessages(response));
  }

  return response;
}

export async function refreshSession(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  const version = sessionVersion;
  refreshPromise = (async () => {
    try {
      const response = await apiRequest('/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      }, false);
      const token = await readAccessToken(response);
      if (sessionVersion !== version) {
        throw new ApiError(401, ['La session a changé pendant son renouvellement.']);
      }
      setAccessToken(token);
      return token;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && sessionVersion === version) {
        setAccessToken(null);
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}
