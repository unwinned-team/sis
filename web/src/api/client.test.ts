import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiRequest,
  apiUpload,
  setAccessToken,
  onAccessTokenChange,
  logoutAfterRefresh,
  ApiError,
} from './client';

// Логика 401 -> refresh -> retry, включая дедуп, сброс и logout-барьер,
// выполненная строго последовательно — state глобального fetch и модульного
// refreshPromise гонять параллельно нельзя.

type Call = { url: string; init?: RequestInit };
type HandlerResult = { status: number; body?: unknown };
type Handler = (n: number) => HandlerResult | Promise<HandlerResult>;

function stubFetch(routes: Record<string, Handler>) {
  const counters: Record<string, number> = {};
  const calls: Call[] = [];
  const fetchStub = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    // Счётчик должен начинаться с 0 (post-increment на undefined даёт NaN -> ломает ветку n===0).
    const idx = key ? (counters[key] ?? 0) : 0;
    if (key) counters[key] = idx + 1;
    const handler = key ? routes[key] : () => ({ status: 404, body: { error: `no route for ${url}` } });
    const { status, body } = await handler(idx);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
    } as unknown as Response;
  };
  return { fetchStub, calls };
}

function auth(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

function accessToken(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `header.${payload}.signature`;
}

async function withFetch<T>(
  routes: Record<string, Handler>,
  fn: (calls: Call[]) => Promise<T>,
): Promise<T> {
  const { fetchStub, calls } = stubFetch(routes);
  const original = globalThis.fetch;
  globalThis.fetch = fetchStub as unknown as typeof globalThis.fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test('api client: 401 -> refresh -> retry, dedupe, fail, upload', async () => {
  // 1. Успешный retry после 401.
  const expired = accessToken('account-x');
  const fresh = accessToken('account-x');
  setAccessToken(null);
  setAccessToken(expired);
  await withFetch(
    {
      '/products/123': (n) =>
        n === 0 ? { status: 401, body: { error: 'Unauthorized' } } : { status: 200, body: { id: 'p1' } },
      '/auth/web/refresh': () => ({ status: 200, body: { accessToken: fresh } }),
    },
    async (calls) => {
      const product = await apiRequest<{ id: string }>('/products/123', { accessToken: expired });
      assert.equal(product.id, 'p1');
      assert.equal(calls.length, 3, 'original + refresh + retry');
      assert.equal(auth(calls[0].init), `Bearer ${expired}`);
      assert.equal(auth(calls[2].init), `Bearer ${fresh}`);
    },
  );

  // 2. Анонимный 401 -> без refresh.
  setAccessToken(null);
  await withFetch(
    { '/orders': () => ({ status: 401, body: { error: 'Unauthorized' } }) },
    async (calls) => {
      await assert.rejects(
        apiRequest('/orders', {}),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).status, 401);
          return true;
        },
      );
      assert.equal(calls.length, 1, 'no refresh without a token');
    },
  );

  // 3. Параллельные 401 делит один refresh (дедуп).
  setAccessToken(null);
  setAccessToken(expired);
  await withFetch(
    {
      '/orders': (n) => (n === 0 ? { status: 401, body: { error: 'Unauthorized' } } : { status: 200, body: { id: 'o1' } }),
      '/products': (n) => (n === 0 ? { status: 401, body: { error: 'Unauthorized' } } : { status: 200, body: { id: 'p1' } }),
      '/auth/web/refresh': () => ({ status: 200, body: { accessToken: fresh } }),
    },
    async (calls) => {
      const [order, product] = await Promise.all([
        apiRequest<{ id: string }>('/orders', { accessToken: expired }),
        apiRequest<{ id: string }>('/products', { accessToken: expired }),
      ]);
      assert.equal(order.id, 'o1');
      assert.equal(product.id, 'p1');
      const refreshCalls = calls.filter((c) => c.url.endsWith('/auth/web/refresh')).length;
      assert.equal(refreshCalls, 1, 'one refresh for two concurrent 401s');
      assert.equal(calls.length, 5, '2x401 + 1 refresh + 2x retry');
    },
  );

  // 4. Refresh-cookie протух -> честный 401, без цикла.
  setAccessToken(expired);
  const tokenChanges: Array<string | null> = [];
  const unsubscribe = onAccessTokenChange((token) => tokenChanges.push(token));
  await withFetch(
    {
      '/orders': () => ({ status: 401, body: { error: 'Unauthorized' } }),
      '/auth/web/refresh': () => ({ status: 401, body: { error: 'Invalid refresh token' } }),
    },
    async (calls) => {
      await assert.rejects(
        apiRequest('/orders', { accessToken: expired }),
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal((err as ApiError).status, 401);
          return true;
        },
      );
      assert.equal(calls.length, 2, 'original + one refresh attempt, no retry');
      assert.equal(tokenChanges.at(-1), null, 'terminal refresh failure clears auth state');

      await assert.rejects(apiRequest('/orders', { accessToken: expired }));
      assert.equal(calls.length, 3, 'stale token no longer starts another refresh');
    },
  );
  unsubscribe();

  // 5. Временный сбой refresh сохраняет сессию и разрешает следующую попытку.
  setAccessToken(expired);
  const transientChanges: Array<string | null> = [];
  const unsubscribeTransient = onAccessTokenChange((token) => transientChanges.push(token));
  await withFetch(
    {
      '/orders': () => ({ status: 401, body: { error: 'Unauthorized' } }),
      '/auth/web/refresh': () => ({ status: 503, body: { error: 'Unavailable' } }),
    },
    async (calls) => {
      await assert.rejects(apiRequest('/orders', { accessToken: expired }));
      await assert.rejects(apiRequest('/orders', { accessToken: expired }));
      assert.equal(calls.filter((call) => call.url.endsWith('/auth/web/refresh')).length, 2);
      assert.deepEqual(transientChanges, [], 'transient failure preserves auth state');
    },
  );
  unsubscribeTransient();

  // 6. apiUpload тоже ретраит на 401.
  setAccessToken(null);
  setAccessToken(expired);
  await withFetch(
    {
      '/images/upload': (n) =>
        n === 0 ? { status: 401, body: { error: 'Unauthorized' } } : { status: 200, body: { url: '/uploads/x.png' } },
      '/auth/web/refresh': () => ({ status: 200, body: { accessToken: fresh } }),
    },
    async (calls) => {
      const result = await apiUpload<{ url: string }>('/images/upload', new FormData(), expired);
      assert.equal(result.url, '/uploads/x.png');
      assert.equal(auth(calls[2].init), `Bearer ${fresh}`);
    },
  );
});

test('api client: cross-account refresh сбрасывает сессию без retry', async () => {
  const expired = accessToken('account-x');
  setAccessToken(expired);
  const tokenChanges: Array<string | null> = [];
  const unsubscribe = onAccessTokenChange((token) => tokenChanges.push(token));

  await withFetch(
    {
      '/orders': () => ({ status: 401, body: { error: 'Unauthorized' } }),
      '/auth/web/refresh': () => ({
        status: 200,
        body: { accessToken: accessToken('account-y') },
      }),
    },
    async (calls) => {
      await assert.rejects(apiRequest('/orders', { method: 'POST', accessToken: expired }));
      assert.equal(calls.length, 2, 'mutation is not retried under another account');
      assert.equal(tokenChanges.at(-1), null, 'stale displayed account is cleared');
    },
  );
  unsubscribe();
});

test('api client: logout ждёт in-flight refresh перед отзывом cookie', async () => {
  const expired = accessToken('account-x');
  setAccessToken(expired);
  let resolveRefresh!: () => void;
  let refreshStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    refreshStarted = resolve;
  });
  await withFetch(
    {
      '/orders': () => ({ status: 401, body: { error: 'Unauthorized' } }),
      '/auth/web/refresh': () => {
        refreshStarted();
        return new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }).then(() => ({ status: 200, body: { accessToken: accessToken('account-x') } }));
      },
      '/auth/logout': () => ({ status: 204 }),
    },
    async (calls) => {
      const pending = apiRequest('/orders', { accessToken: expired }).catch((e: unknown) => e);

      await started;
      const logout = logoutAfterRefresh(() =>
        apiRequest('/auth/logout', { method: 'POST', withCredentials: true }),
      );
      assert.equal(calls.some((call) => call.url.endsWith('/auth/logout')), false);
      resolveRefresh!();

      const err = await pending;
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 401, 'запрос падает с исходным 401, а не воскрешает токен');
      await logout;

      const refreshIndex = calls.findIndex((call) => call.url.endsWith('/auth/web/refresh'));
      const logoutIndex = calls.findIndex((call) => call.url.endsWith('/auth/logout'));
      assert.ok(logoutIndex > refreshIndex, 'logout runs after refresh response applies its cookie');

      await assert.rejects(apiRequest('/orders', {}));
      assert.equal(calls.filter((c) => c.url.endsWith('/auth/web/refresh')).length, 1);
      assert.equal(auth(calls.at(-1)?.init), undefined, 'no Authorization after logout');
    },
  );
});
