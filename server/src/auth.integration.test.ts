import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";
import app from "./app.js";
import prisma from "./prisma.js";
import { signAccessToken } from "./lib/jwt.js";
import { hashPassword } from "./lib/password.js";

interface ApiResult {
  status: number;
  body: any;
  setCookies: string[];
}

let server: Server | undefined;
let baseUrl = "";
let prefix = "";

before(async () => {
  await prisma.$connect();
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
    started.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

beforeEach(() => {
  prefix = `it-auth-${randomUUID()}`;
});

afterEach(async () => {
  // Зарегистрированные через API клиенты получают cuid-id — чистим по префиксу
  // email; фикстурные записи — по префиксу id. RefreshToken каскадится.
  await prisma.order.deleteMany({
    where: { customer: { email: { startsWith: prefix } } },
  });
  await prisma.order.deleteMany({ where: { customerId: { startsWith: prefix } } });
  await prisma.product.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.category.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.customer.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.customer.deleteMany({ where: { id: { startsWith: prefix } } });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await prisma.$disconnect();
});

async function api(
  method: string,
  path: string,
  options: { body?: Record<string, unknown>; token?: string; cookie?: string } = {},
): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
      ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    // undici не хранит cookies — парсим set-cookie вручную.
    setCookies: response.headers.getSetCookie(),
  };
}

function refreshSetCookie(result: ApiResult): string | undefined {
  return result.setCookies.find((cookie) => cookie.startsWith("refreshToken="));
}

// Возвращает пару name=value для заголовка Cookie следующего запроса.
function refreshCookiePair(result: ApiResult): string {
  const setCookie = refreshSetCookie(result);
  assert.ok(setCookie, "expected a refreshToken Set-Cookie header");
  return setCookie.split(";")[0]!;
}

function registerBody(suffix: string) {
  return {
    name: `${prefix} ${suffix}`,
    email: `${prefix}-${suffix}@example.test`,
    password: "correct horse battery staple",
  };
}

async function addAdmin(options: { isActive?: boolean; suffix?: string } = {}) {
  const suffix = options.suffix ?? "";
  const customer = await prisma.customer.create({
    data: {
      id: `${prefix}${suffix}-admin`,
      name: `${prefix} admin`,
      email: `${prefix}${suffix}-admin@example.test`,
      role: "ADMIN",
      isActive: options.isActive ?? true,
      passwordHash: await hashPassword("admin-password-123"),
    },
  });
  const token = await signAccessToken({ sub: customer.id, role: "ADMIN" });
  return { customer, token };
}

test("web register sets an HttpOnly refresh cookie and omits the token from the body", async () => {
  const result = await api("POST", "/auth/web/register", { body: registerBody("web") });

  assert.equal(result.status, 201);
  assert.ok(result.body.accessToken);
  assert.equal(result.body.refreshToken, undefined);
  assert.equal(result.body.user.role, "CUSTOMER");
  assert.equal(result.body.user.passwordHash, undefined);
  assert.equal(result.body.user.totpSecret, undefined);

  const cookie = refreshSetCookie(result);
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api\/v1\/auth/i);
});

test("mobile register returns the refresh token in the body without a cookie", async () => {
  const result = await api("POST", "/auth/mobile/register", { body: registerBody("mobile") });

  assert.equal(result.status, 201);
  assert.ok(result.body.accessToken);
  assert.ok(result.body.refreshToken);
  assert.equal(refreshSetCookie(result), undefined);
});

test("register rejects a duplicate email with 409 and a short password with 400", async () => {
  const body = registerBody("dup");
  const first = await api("POST", "/auth/web/register", { body });
  const duplicate = await api("POST", "/auth/web/register", { body });
  const shortPassword = await api("POST", "/auth/web/register", {
    body: { ...registerBody("short"), password: "1234567" },
  });

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 409);
  assert.equal(shortPassword.status, 400);
});

test("login returns the profile and me works with the access token", async () => {
  const body = registerBody("login");
  await api("POST", "/auth/web/register", { body });

  const login = await api("POST", "/auth/web/login", {
    body: { email: body.email, password: body.password },
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, body.email);
  assert.equal(login.body.user.passwordHash, undefined);
  assert.ok(refreshSetCookie(login));

  const me = await api("GET", "/auth/me", { token: login.body.accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, body.email);
  assert.equal(me.body.passwordHash, undefined);
  assert.equal(me.body.totpSecret, undefined);

  const withoutToken = await api("GET", "/auth/me");
  assert.equal(withoutToken.status, 401);
});

test("login failures are a uniform 401 Invalid credentials", async () => {
  const body = registerBody("uniform");
  await api("POST", "/auth/web/register", { body });
  // Walk-in клиент без пароля — логин невозможен.
  await prisma.customer.create({
    data: {
      id: `${prefix}-walkin-customer`,
      name: `${prefix} walk-in`,
      email: `${prefix}-walkin@example.test`,
    },
  });
  // Заблокированный аккаунт с верным паролем.
  const blockedEmail = `${prefix}-blocked@example.test`;
  await prisma.customer.create({
    data: {
      id: `${prefix}-blocked-customer`,
      name: `${prefix} blocked`,
      email: blockedEmail,
      passwordHash: await hashPassword(body.password),
      isActive: false,
    },
  });

  const attempts = [
    { email: body.email, password: "wrong password" },
    { email: `${prefix}-missing@example.test`, password: body.password },
    { email: `${prefix}-walkin@example.test`, password: body.password },
    { email: blockedEmail, password: body.password },
  ];
  for (const attempt of attempts) {
    const result = await api("POST", "/auth/web/login", { body: attempt });
    assert.equal(result.status, 401, `login as ${attempt.email}`);
    assert.deepEqual(result.body, { error: "Invalid credentials" });
  }
});

test("web refresh rotates the token and replay revokes every session", async () => {
  const registered = await api("POST", "/auth/web/register", { body: registerBody("rotate") });
  const first = refreshCookiePair(registered);

  const rotated = await api("POST", "/auth/web/refresh", { cookie: first });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.body.accessToken);
  const second = refreshCookiePair(rotated);
  assert.notEqual(second, first);

  // Новый токен работает.
  const rotatedAgain = await api("POST", "/auth/web/refresh", { cookie: second });
  assert.equal(rotatedAgain.status, 200);
  const third = refreshCookiePair(rotatedAgain);

  // Реплей уже ротированного токена = кража: 401, cookie чистится...
  const replay = await api("POST", "/auth/web/refresh", { cookie: first });
  assert.equal(replay.status, 401);
  const cleared = refreshSetCookie(replay);
  assert.ok(cleared);
  assert.match(cleared, /refreshToken=;/);

  // ...и отзываются все токены пользователя, включая последний живой.
  const afterReplay = await api("POST", "/auth/web/refresh", { cookie: third });
  assert.equal(afterReplay.status, 401);
});

test("mobile refresh rotates via the body and rejects the previous token", async () => {
  const registered = await api("POST", "/auth/mobile/register", { body: registerBody("mrotate") });
  const first = registered.body.refreshToken;

  const rotated = await api("POST", "/auth/mobile/refresh", { body: { refreshToken: first } });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.body.accessToken);
  assert.ok(rotated.body.refreshToken);
  assert.notEqual(rotated.body.refreshToken, first);
  assert.equal(refreshSetCookie(rotated), undefined);

  const replay = await api("POST", "/auth/mobile/refresh", { body: { refreshToken: first } });
  assert.equal(replay.status, 401);

  const afterReplay = await api("POST", "/auth/mobile/refresh", {
    body: { refreshToken: rotated.body.refreshToken },
  });
  assert.equal(afterReplay.status, 401);
});

test("refresh without a token and with an unknown token returns 401", async () => {
  const missing = await api("POST", "/auth/web/refresh");
  const unknown = await api("POST", "/auth/web/refresh", {
    cookie: "refreshToken=definitely-not-a-real-token",
  });
  const mobileMissing = await api("POST", "/auth/mobile/refresh", { body: {} });

  assert.equal(missing.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(mobileMissing.status, 401);
});

test("logout revokes the session, clears the cookie and is idempotent", async () => {
  const registered = await api("POST", "/auth/web/register", { body: registerBody("logout") });
  const cookie = refreshCookiePair(registered);

  const logout = await api("POST", "/auth/logout", { cookie });
  assert.equal(logout.status, 204);
  const cleared = refreshSetCookie(logout);
  assert.ok(cleared);
  assert.match(cleared, /refreshToken=;/);

  const refreshAfterLogout = await api("POST", "/auth/web/refresh", { cookie });
  assert.equal(refreshAfterLogout.status, 401);

  const logoutAgain = await api("POST", "/auth/logout", { cookie });
  assert.equal(logoutAgain.status, 204);

  const logoutWithoutToken = await api("POST", "/auth/logout");
  assert.equal(logoutWithoutToken.status, 204);
});

test("protected routes return 401 without a token", async () => {
  for (const [method, path] of [
    ["GET", "/orders"],
    ["POST", "/orders"],
    ["GET", "/customers"],
    ["POST", "/products"],
  ] as const) {
    const result = await api(method, path);
    assert.equal(result.status, 401, `${method} ${path}`);
  }
});

test("customers get 403 on admin routes", async () => {
  const registered = await api("POST", "/auth/mobile/register", { body: registerBody("cust") });
  const token = registered.body.accessToken;

  for (const [method, path, body] of [
    ["GET", "/customers", undefined],
    ["POST", "/products", { name: "x" }],
    ["PUT", "/orders/some-id", { status: "COMPLETED" }],
  ] as const) {
    const result = await api(method, path, { token, ...(body ? { body } : {}) });
    assert.equal(result.status, 403, `${method} ${path}`);
  }
});

test("a deactivated admin gets 403 even with a valid access token", async () => {
  const active = await addAdmin({ suffix: "-active" });
  const blocked = await addAdmin({ suffix: "-blocked", isActive: false });

  const allowed = await api("GET", "/customers", { token: active.token });
  assert.equal(allowed.status, 200);

  // Токен валиден, но requireAdmin проверяет БД на каждый запрос.
  const denied = await api("GET", "/customers", { token: blocked.token });
  assert.equal(denied.status, 403);
});

test("customers see only their own orders; foreign order ids answer 404", async () => {
  await prisma.category.create({
    data: { id: `${prefix}-category`, name: `${prefix} category`, slug: prefix },
  });
  const product = await prisma.product.create({
    data: {
      id: `${prefix}-product`,
      name: `${prefix} product`,
      description: "Integration test product",
      price: "10.00",
      categoryId: `${prefix}-category`,
      imageUrl: "https://example.test/product.png",
    },
  });

  const [alice, bob] = await Promise.all(
    ["alice", "bob"].map((name) =>
      api("POST", "/auth/mobile/register", { body: registerBody(name) }),
    ),
  );
  const order = await api("POST", "/orders", {
    token: alice!.body.accessToken,
    body: { paymentMethod: "CARD", items: [{ productId: product.id, quantity: 1 }] },
  });
  assert.equal(order.status, 201);

  const aliceList = await api("GET", "/orders", { token: alice!.body.accessToken });
  assert.equal(aliceList.status, 200);
  assert.deepEqual(
    aliceList.body.map((entry: { id: string }) => entry.id),
    [order.body.id],
  );

  const bobList = await api("GET", "/orders", { token: bob!.body.accessToken });
  assert.equal(bobList.status, 200);
  assert.deepEqual(bobList.body, []);

  const bobRead = await api("GET", `/orders/${order.body.id}`, {
    token: bob!.body.accessToken,
  });
  assert.equal(bobRead.status, 404);

  const bobDelete = await api("DELETE", `/orders/${order.body.id}`, {
    token: bob!.body.accessToken,
  });
  assert.equal(bobDelete.status, 404);
  assert.equal(await prisma.order.count({ where: { id: order.body.id } }), 1);

  const admin = await addAdmin();
  const adminRead = await api("GET", `/orders/${order.body.id}`, { token: admin.token });
  assert.equal(adminRead.status, 200);
  // Профиль клиента в заказе урезан до id/name/phone — без email и секретов.
  assert.deepEqual(Object.keys(adminRead.body.customer).sort(), ["id", "name", "phone"]);
});
