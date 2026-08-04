const API_BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:4000/api/v1';
const REFRESH_PATH = '/auth/web/refresh';
const REFRESH_TIMEOUT_MS = 10_000;

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

// Access-токен живёт 15 минут и хранится в памяти; при истечении обмен refresh-cookie
// даёт новый. Холдер + подписка держат React-состояние синхронным с фоновым refresh.
let currentAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();
// Поколение токена: выход бампает счётчик, зависший refresh после await видит
// старое поколение и выбрасывает — иначе воскрешает токен после logout.
let tokenGeneration = 0;

export function setAccessToken(token: string | null): void {
  if (!token) tokenGeneration++;
  currentAccessToken = token;
  for (const cb of tokenListeners) cb(token);
}

export function onAccessTokenChange(cb: (token: string | null) => void): () => void {
  tokenListeners.add(cb);
  return () => {
    tokenListeners.delete(cb);
  };
}

// ponytail: один in-flight refresh на всех — параллельные 401 доезжают до одного
// запроса, иначе гонка с реплей-защитой ротации отзовёт всю семью токенов и-user
// вылетит. Потенциально избыточный refresh в микротаск-окне между finally и
// resolve — безвреден ( второй свежий токен), потолок: редко лишний раунд.
let refreshPromise: Promise<string> | null = null;
let logoutPromise: Promise<void> | null = null;

function accessTokenSubject(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as {
      sub?: unknown;
    };
    return typeof parsed.sub === 'string' && parsed.sub ? parsed.sub : null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string> {
  if (logoutPromise) {
    throw new ApiError(401, 'session is logging out');
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const generation = tokenGeneration;
      try {
        const res = await fetch(`${API_BASE_URL}${REFRESH_PATH}`, {
          method: 'POST',
          credentials: 'include',
          signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
        });
        if (!res.ok) {
          if (res.status === 401) setAccessToken(null);
          throw new ApiError(
            res.status,
            `refresh failed with status ${res.status}`,
            await readErrorBody(res),
          );
        }
        const data: unknown = await res.json().catch(() => undefined);
        if (generation !== tokenGeneration) {
          throw new ApiError(401, 'session changed during refresh');
        }
        if (
          !data ||
          typeof data !== 'object' ||
          !('accessToken' in data) ||
          typeof data.accessToken !== 'string' ||
          data.accessToken.trim() === ''
        ) {
          throw new ApiError(502, 'refresh returned malformed response', data);
        }
        return data.accessToken;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function refreshSession(token: string): Promise<string> {
  const fresh = await refreshAccessToken();
  const subject = accessTokenSubject(token);
  if (!subject || accessTokenSubject(fresh) !== subject) {
    setAccessToken(null);
    throw new ApiError(401, 'session changed during refresh');
  }
  setAccessToken(fresh);
  return fresh;
}

export function logoutAfterRefresh(logout: () => Promise<void>): Promise<void> {
  if (!logoutPromise) {
    setAccessToken(null);
    const pendingRefresh = refreshPromise;
    logoutPromise = (async () => {
      await pendingRefresh?.catch(() => undefined);
      await logout();
    })().finally(() => {
      logoutPromise = null;
    });
  }
  return logoutPromise;
}

export async function apiGet<T>(path: string): Promise<T> {
  // Таймаут: на мобильной сети зависшее соединение (без RST) иначе вешает
  // страницу на скелетоне навсегда — ретраи не спасают, ошибки нет.
  const res = await fetch(`${API_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(15_000),
  });
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
  // Доступ до заголовків відповіді (X-Total-Count у пагінації клієнтів).
  onResponse?: (res: Response) => void;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, accessToken, withCredentials = false, onResponse } = options;
  const initialToken = accessToken ?? currentAccessToken;

  async function attempt(token: string | null, isRetry: boolean): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: withCredentials ? 'include' : 'same-origin',
    });

    onResponse?.(res);

    if (!res.ok) {
      // Access-токен протух (15 мин): молча обменять refresh-cookie и повторить один раз.
      // Второй 401 = refresh-cookie тоже протух (12 ч админ / 30 дн юзер) — тогда честно
      // пробрасываем 401, чтобы страница показала «Сесія закінчилася. Увійдіть ще раз.»
      if (
        res.status === 401 &&
        !isRetry &&
        path !== REFRESH_PATH &&
        token !== null &&
        token === currentAccessToken
      ) {
        // ponytail: любой 401 (не только протухший токен) триггерит refresh —
        // отличить нечем, лишний раунд ротации на логин-странице безвреден.
        let fresh: string;
        try {
          fresh = await refreshSession(token);
        } catch {
          // Refresh упал (cookie протух, выход) — отдаём ошибку исходного запроса.
          throw new ApiError(
            res.status,
            `${method} ${path} failed with status ${res.status}`,
            await readErrorBody(res),
          );
        }
        return attempt(fresh, true);
      }
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

  return attempt(initialToken, false);
}

export async function apiUpload<T>(
  path: string,
  form: FormData,
  accessToken?: string | null,
): Promise<T> {
  const initialToken = accessToken ?? currentAccessToken;

  async function attempt(token: string | null, isRetry: boolean): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: form,
    });

    if (!res.ok) {
      if (
        res.status === 401 &&
        !isRetry &&
        path !== REFRESH_PATH &&
        token !== null &&
        token === currentAccessToken
      ) {
        let fresh: string;
        try {
          fresh = await refreshSession(token);
        } catch {
          throw new ApiError(
            res.status,
            `POST ${path} failed with status ${res.status}`,
            await readErrorBody(res),
          );
        }
        return attempt(fresh, true);
      }
      throw new ApiError(
        res.status,
        `POST ${path} failed with status ${res.status}`,
        await readErrorBody(res),
      );
    }
    return res.json() as Promise<T>;
  }

  return attempt(initialToken, false);
}
