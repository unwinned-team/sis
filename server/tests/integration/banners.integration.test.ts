import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test, { after, afterEach, before, beforeEach } from "node:test";
import sharp from "sharp";
import app from "../../src/app.js";
import prisma from "../../src/prisma.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { hashPassword } from "../../src/lib/password.js";

interface ApiResult {
  status: number;
  body: any;
}

let server: Server | undefined;
let rootUrl = "";
let baseUrl = "";
let prefix = "";
// Банери видаляємо за id-ами (cuid, не prefix), а файли — за snapshot
// uploads/ (як у images.integration.test.ts:18-46).
let uploadsSnapshot = new Set<string>();
let createdBannerIds: string[] = [];

const uploadsDir = path.resolve("uploads");

before(async () => {
  await prisma.$connect();
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
    started.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  rootUrl = `http://127.0.0.1:${address.port}`;
  baseUrl = `${rootUrl}/api/v1`;
});

beforeEach(async () => {
  prefix = `it-bn-${randomUUID()}`;
  uploadsSnapshot = new Set(await fs.readdir(uploadsDir));
  createdBannerIds = [];
});

afterEach(async () => {
  for (const name of await fs.readdir(uploadsDir)) {
    if (!uploadsSnapshot.has(name)) {
      await fs.unlink(path.join(uploadsDir, name)).catch(() => {});
    }
  }
  if (createdBannerIds.length) {
    await prisma.banner.deleteMany({ where: { id: { in: createdBannerIds } } });
  }
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
  urlPath: string,
  options: { body?: unknown; token?: string } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function addAdmin() {
  const customer = await prisma.customer.create({
    data: {
      id: `${prefix}-admin`,
      name: `${prefix} admin`,
      email: `${prefix}-admin@example.test`,
      role: "ADMIN",
      passwordHash: await hashPassword("admin-password-123"),
    },
  });
  return signAccessToken({ sub: customer.id, role: "ADMIN" });
}

async function addCustomerToken() {
  const customer = await prisma.customer.create({
    data: { id: `${prefix}-customer`, name: `${prefix} customer` },
  });
  return signAccessToken({ sub: customer.id, role: "CUSTOMER" });
}

// Створює реальний webp-файл у /uploads, повертає URL виду /uploads/<uuid>.webp.
// Імітує крок, який зазвичай робить адмін через /api/v1/images/upload.
async function makeWebpUrl(): Promise<string> {
  const id = randomUUID();
  const filename = `${id}.webp`;
  await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .webp()
    .toFile(path.join(uploadsDir, filename));
  return `/uploads/${filename}`;
}

function track(banner: { id: string }) {
  createdBannerIds.push(banner.id);
}

test("GET /banners is public, filters isActive=false, orders by sortOrder", async () => {
  const token = await addAdmin();
  // Створюємо з явними sortOrder: 2, 0, 1 — список має повернути 0, 1, 2.
  const a = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl(), sortOrder: 2 } });
  const b = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl(), sortOrder: 0 } });
  const c = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl(), sortOrder: 1 } });
  const hidden = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl(), isActive: false } });
  track(a.body); track(b.body); track(c.body); track(hidden.body);

  const list = await api("GET", "/banners");
  assert.equal(list.status, 200);
  const ours = list.body.filter((row: { id: string }) => createdBannerIds.includes(row.id));
  // Неактивний не повинен потрапити у публічний список.
  assert.equal(ours.length, 3);
  assert.deepEqual(
    ours.map((row: { sortOrder: number }) => row.sortOrder),
    [0, 1, 2],
  );
  assert.deepEqual(Object.keys(ours[0]).sort(), [
    "createdAt",
    "id",
    "imageUrl",
    "isActive",
    "link",
    "sortOrder",
  ]);
});

test("GET /banners?includeInactive=true exposes hidden banners", async () => {
  const token = await addAdmin();
  const visible = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl() } });
  const hidden = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl(), isActive: false } });
  track(visible.body); track(hidden.body);

  // Публічний без прапора — тільки visible.
  const publicList = await api("GET", "/banners");
  const publicIds = (publicList.body as Array<{ id: string }>).map((row) => row.id);
  assert.ok(publicIds.includes(visible.body.id));
  assert.ok(!publicIds.includes(hidden.body.id));

  // З includeInactive=true — обидва.
  const adminList = await api("GET", "/banners?includeInactive=true", { token });
  const adminIds = (adminList.body as Array<{ id: string }>).map((row) => row.id);
  assert.ok(adminIds.includes(visible.body.id));
  assert.ok(adminIds.includes(hidden.body.id));
});

test("admin-only endpoints reject anonymous and customer (401/403)", async () => {
  const customerToken = await addCustomerToken();
  for (const [method, urlPath, body] of [
    ["POST", "/banners", { imageUrl: "/uploads/x.webp" }],
    ["POST", "/banners/reorder", { ids: ["a"] }],
    ["PATCH", "/banners/some-id", { isActive: false }],
    ["DELETE", "/banners/some-id", undefined],
  ] as const) {
    const anonymous = await api(method, urlPath, body === undefined ? {} : { body });
    assert.equal(anonymous.status, 401, `${method} ${urlPath} anonymous -> 401`);

    const asCustomer = await api(method, urlPath, body === undefined ? { token: customerToken } : { token: customerToken, body });
    assert.equal(asCustomer.status, 403, `${method} ${urlPath} as customer -> 403`);
  }
});

test("POST /banners creates with/without link, rejects bad link", async () => {
  const token = await addAdmin();
  const ok = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl(), link: "/category/ice" } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.link, "/category/ice");
  track(ok.body);

  const noLink = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl() } });
  assert.equal(noLink.status, 201);
  assert.equal(noLink.body.link, null);
  track(noLink.body);

  const external = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl(), link: "https://example.com" } });
  assert.equal(external.status, 201);
  track(external.body);

  for (const link of ["/etc/passwd", "javascript:alert(1)", "http://insecure.test", ""]) {
    const bad = await api("POST", "/banners", { token, body: { imageUrl: "/uploads/x.webp", link } });
    assert.equal(bad.status, 400, `link "${link}" must be rejected`);
  }
  // imageUrl обов'язковий
  const noImage = await api("POST", "/banners", { token, body: { link: "/category/ice" } });
  assert.equal(noImage.status, 400);
});

test("PATCH /banners updates partial fields; link: null clears clickability", async () => {
  const token = await addAdmin();
  const created = await api("POST", "/banners", {
    token,
    body: { imageUrl: await makeWebpUrl(), link: "/category/ice" },
  });
  track(created.body);

  const updated = await api("PATCH", `/banners/${created.body.id}`, { token, body: { link: null } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.link, null);
  assert.equal(updated.body.isActive, true);

  const flipped = await api("PATCH", `/banners/${created.body.id}`, { token, body: { isActive: false, link: "https://x.test" } });
  assert.equal(flipped.status, 200);
  assert.equal(flipped.body.isActive, false);
  assert.equal(flipped.body.link, "https://x.test");

  const bad = await api("PATCH", `/banners/${created.body.id}`, { token, body: { link: "/etc/passwd" } });
  assert.equal(bad.status, 400);

  const missing = await api("PATCH", "/banners/does-not-exist", { token, body: { isActive: false } });
  assert.equal(missing.status, 500); // Prisma P2025, не наш 404 — достатньо що не 200
});

test("DELETE /banners removes record and unlinks the file from disk", async () => {
  const token = await addAdmin();
  const created = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl() } });
  track(created.body);
  const filePath = path.join(uploadsDir, path.basename(created.body.imageUrl));
  await fs.access(filePath); // файл існує

  const deleted = await api("DELETE", `/banners/${created.body.id}`, { token });
  assert.equal(deleted.status, 204);

  const row = await prisma.banner.findUnique({ where: { id: created.body.id } });
  assert.equal(row, null);
  await assert.rejects(fs.access(filePath), "the file must be unlinked");
  // Видаляємо з трекера, бо рядка вже нема.
  createdBannerIds = createdBannerIds.filter((id) => id !== created.body.id);

  const missing = await api("DELETE", "/banners/does-not-exist", { token });
  assert.equal(missing.status, 404);
});

test("POST /banners/reorder assigns sortOrder = index", async () => {
  const token = await addAdmin();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await api("POST", "/banners", { token, body: { imageUrl: await makeWebpUrl() } });
    track(r.body);
    ids.push(r.body.id);
  }

  // Передаємо у зворотному порядку — після reorder sortOrder має відповідати.
  const reversed = [...ids].reverse();
  const reorder = await api("POST", "/banners/reorder", { token, body: { ids: reversed } });
  assert.equal(reorder.status, 204);

  const after = await api("GET", "/banners?includeInactive=true", { token });
  const rows = (after.body as Array<{ id: string; sortOrder: number }>).filter((row) => ids.includes(row.id));
  assert.deepEqual(
    rows.map((row) => row.sortOrder),
    [0, 1, 2],
  );

  // Неіснуючий id кидає помилку Prisma (P2025) — приймаємо 500, а не 200/204.
  const broken = await api("POST", "/banners/reorder", { token, body: { ids: [reversed[0]!, "nope-not-real"] } });
  assert.equal(broken.status, 500);

  // Порожній масив — 400 за схемою.
  const empty = await api("POST", "/banners/reorder", { token, body: { ids: [] } });
  assert.equal(empty.status, 400);
});
