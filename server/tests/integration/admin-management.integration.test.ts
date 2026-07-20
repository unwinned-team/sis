// Управление ролями и блокировкой (ADMIN.md §7). Каталог, варианты и заказы
// покрыты products/orders/categories.integration.test.ts — здесь только то,
// чего в них нет.
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";
import app from "../../src/app.js";
import prisma from "../../src/prisma.js";
import { signAccessToken } from "../../src/lib/jwt.js";

interface ApiResult {
  status: number;
  body: any;
}

let server: Server | undefined;
let baseUrl = "";
let prefix = "";
let admin = { id: "", token: "" };
let customer = { id: "", token: "" };

before(async () => {
  await prisma.$connect();
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
    started.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

beforeEach(async () => {
  prefix = `am-${randomUUID()}`;
  const [adminCustomer, plainCustomer] = await Promise.all([
    prisma.customer.create({
      data: {
        id: `${prefix}-admin`,
        name: `${prefix} admin`,
        email: `${prefix}-admin@example.test`,
        role: "ADMIN",
      },
    }),
    prisma.customer.create({
      data: {
        id: `${prefix}-customer`,
        name: `${prefix} customer`,
        email: `${prefix}-customer@example.test`,
      },
    }),
  ]);
  admin = {
    id: adminCustomer.id,
    token: await signAccessToken({ sub: adminCustomer.id, role: "ADMIN" }),
  };
  customer = {
    id: plainCustomer.id,
    token: await signAccessToken({ sub: plainCustomer.id, role: "CUSTOMER" }),
  };
});

afterEach(async () => {
  await prisma.refreshToken.deleteMany({
    where: { customerId: { startsWith: prefix } },
  });
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
  body?: Record<string, unknown>,
  token?: string,
): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("an admin promotes and demotes another customer", async () => {
  const promoted = await api(
    "PATCH",
    `/customers/${customer.id}/role`,
    { role: "ADMIN" },
    admin.token,
  );
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.role, "ADMIN");
  // Секреты не должны попадать в ответ роутов управления ролями.
  assert.equal(promoted.body.passwordHash, undefined);
  assert.equal(promoted.body.totpSecret, undefined);

  const demoted = await api(
    "PATCH",
    `/customers/${customer.id}/role`,
    { role: "CUSTOMER" },
    admin.token,
  );
  assert.equal(demoted.status, 200);
  assert.equal(demoted.body.role, "CUSTOMER");
});

test("an admin can block and unblock another customer", async () => {
  const blocked = await api(
    "PATCH",
    `/customers/${customer.id}/active`,
    { isActive: false },
    admin.token,
  );
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.isActive, false);

  const unblocked = await api(
    "PATCH",
    `/customers/${customer.id}/active`,
    { isActive: true },
    admin.token,
  );
  assert.equal(unblocked.status, 200);
  assert.equal(unblocked.body.isActive, true);
});

// Иначе админ разлогинил бы сам себя одним кликом и не смог бы вернуться.
test("an admin cannot demote or block themselves", async () => {
  const role = await api(
    "PATCH",
    `/customers/${admin.id}/role`,
    { role: "CUSTOMER" },
    admin.token,
  );
  assert.equal(role.status, 403);

  const active = await api(
    "PATCH",
    `/customers/${admin.id}/active`,
    { isActive: false },
    admin.token,
  );
  assert.equal(active.status, 403);

  // Права не изменились.
  const unchanged = await prisma.customer.findUniqueOrThrow({ where: { id: admin.id } });
  assert.equal(unchanged.role, "ADMIN");
  assert.equal(unchanged.isActive, true);
});

// Тестовые файлы выполняются параллельно, поэтому число админов в базе заранее
// неизвестно — проверяем оба исхода по фактическому состоянию на момент вызова.
test("the last active admin is protected from demotion", async () => {
  const target = await prisma.customer.create({
    data: {
      id: `${prefix}-admin2`,
      name: `${prefix} admin2`,
      email: `${prefix}-admin2@example.test`,
      role: "ADMIN",
    },
  });

  const others = await prisma.customer.count({
    where: { role: "ADMIN", isActive: true, id: { not: target.id } },
  });

  const demoted = await api(
    "PATCH",
    `/customers/${target.id}/role`,
    { role: "CUSTOMER" },
    admin.token,
  );

  if (others === 0) {
    assert.equal(demoted.status, 409);
    const stillAdmin = await prisma.customer.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(stillAdmin.role, "ADMIN");
  } else {
    assert.equal(demoted.status, 200);
    assert.equal(demoted.body.role, "CUSTOMER");
  }
});

// requireAdmin ходит в БД и отсечёт доступ сразу, но живой refresh-токен
// продолжил бы выдавать новые access-токены — поэтому отзываем явно.
test("demotion and blocking revoke the target's refresh tokens", async () => {
  for (const [suffix, path, body] of [
    ["demote", "role", { role: "CUSTOMER" }],
    ["block", "active", { isActive: false }],
  ] as const) {
    const target = await prisma.customer.create({
      data: {
        id: `${prefix}-${suffix}`,
        name: `${prefix} ${suffix}`,
        email: `${prefix}-${suffix}@example.test`,
        role: suffix === "demote" ? "ADMIN" : "CUSTOMER",
      },
    });
    await prisma.refreshToken.create({
      data: {
        tokenHash: `${prefix}-${suffix}-hash`,
        customerId: target.id,
        familyId: `${prefix}-${suffix}-family`,
        client: "WEB",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const result = await api("PATCH", `/customers/${target.id}/${path}`, body, admin.token);
    assert.equal(result.status, 200, `${suffix} should succeed`);

    const live = await prisma.refreshToken.count({
      where: { customerId: target.id, revokedAt: null },
    });
    assert.equal(live, 0, `${suffix} must revoke sessions`);
  }
});

test("the customer list can be filtered by role and hides secrets", async () => {
  const admins = await api("GET", "/customers?role=ADMIN", undefined, admin.token);
  assert.equal(admins.status, 200);
  assert.ok(Array.isArray(admins.body), "response stays a bare array");
  assert.ok(admins.body.every((entry: { role: string }) => entry.role === "ADMIN"));
  assert.ok(admins.body.some((entry: { id: string }) => entry.id === admin.id));
  for (const entry of admins.body) {
    assert.equal(entry.passwordHash, undefined);
    assert.equal(entry.totpSecret, undefined);
  }

  const customers = await api("GET", "/customers?role=CUSTOMER", undefined, admin.token);
  assert.ok(customers.body.every((entry: { role: string }) => entry.role === "CUSTOMER"));

  const invalid = await api("GET", "/customers?role=NOBODY", undefined, admin.token);
  assert.equal(invalid.status, 400);
});

test("role and active routes are admin-only and validate their input", async () => {
  const forbidden = [
    await api("PATCH", `/customers/${admin.id}/role`, { role: "CUSTOMER" }, customer.token),
    await api("PATCH", `/customers/${admin.id}/active`, { isActive: false }, customer.token),
  ];
  for (const call of forbidden) {
    assert.equal(call.status, 403);
  }

  const badRole = await api(
    "PATCH",
    `/customers/${customer.id}/role`,
    { role: "SUPERUSER" },
    admin.token,
  );
  assert.equal(badRole.status, 400);

  const missing = await api(
    "PATCH",
    `/customers/${prefix}-nobody/role`,
    { role: "ADMIN" },
    admin.token,
  );
  assert.equal(missing.status, 404);
});
