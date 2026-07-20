const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function apiErrorText(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const data = error.data;
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error: unknown }).error;
    if (typeof message === 'string') return message;
  }
  return null;
}

async function readErrorBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
  withCredentials?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, accessToken, withCredentials = false } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: withCredentials ? 'include' : 'same-origin',
  });

  if (!res.ok) {
    throw new ApiError(
      res.status,
      `${method} ${path} failed with status ${res.status}`,
      await readErrorBody(res),
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(
  path: string,
  form: FormData,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST ${path} failed with status ${res.status}`,
      await readErrorBody(res),
    );
  }
  return res.json() as Promise<T>;
}
