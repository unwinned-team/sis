import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test, { after, afterEach, before, beforeEach } from "node:test";
import app from "../../src/app.js";
import prisma from "../../src/prisma.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { hashPassword } from "../../src/lib/password.js";

let server: Server | undefined;
let rootUrl = "";
let baseUrl = "";
let prefix = "";
// Файлы в uploads/ именуются uuid-ами — чистим по разнице со снимком,
// чтобы не задеть дев-загрузки, лежащие в той же папке.
let uploadsSnapshot = new Set<string>();

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
  prefix = `it-img-${randomUUID()}`;
  uploadsSnapshot = new Set(await fs.readdir(uploadsDir));
});

afterEach(async () => {
  for (const name of await fs.readdir(uploadsDir)) {
    if (!uploadsSnapshot.has(name)) {
      await fs.unlink(path.join(uploadsDir, name)).catch(() => {});
    }
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

function imageForm(options: { name?: string; type?: string; bytes?: number; fields?: Record<string, string> } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.append(key, value);
  }
  const content = new Uint8Array(options.bytes ?? 128).fill(1);
  form.append("image", new File([content], options.name ?? "photo.png", { type: options.type ?? "image/png" }));
  return form;
}

async function send(path: string, options: { token?: string; form?: FormData; json?: unknown; method?: string } = {}) {
  const body = options.form ?? (options.json === undefined ? undefined : JSON.stringify(options.json));
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers: {
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
      ...(options.json === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function diskPathOf(url: string) {
  return path.join(uploadsDir, path.basename(url));
}

test("image endpoints are admin-only", async () => {
  const customer = await prisma.customer.create({
    data: { id: `${prefix}-customer`, name: `${prefix} customer` },
  });
  const customerToken = await signAccessToken({ sub: customer.id, role: "CUSTOMER" });

  for (const [method, path] of [
    ["POST", "/images/upload"],
    ["POST", "/images/replace"],
    ["DELETE", "/images"],
  ] as const) {
    const anonymous = await send(path, { method, form: imageForm() });
    assert.equal(anonymous.status, 401, `${method} ${path} without a token`);

    const asCustomer = await send(path, { method, token: customerToken, form: imageForm() });
    assert.equal(asCustomer.status, 403, `${method} ${path} as a customer`);
  }
});

test("upload stores a png on disk and serves it back over /uploads", async () => {
  const token = await addAdmin();

  const uploaded = await send("/images/upload", { token, form: imageForm() });
  assert.equal(uploaded.status, 201);
  assert.match(uploaded.body.url, /^\/uploads\/[0-9a-f-]{36}\.png$/);
  await fs.access(diskPathOf(uploaded.body.url));

  // Загруженная картинка должна быть доступна фронтенду по своему url.
  const served = await fetch(`${rootUrl}${uploaded.body.url}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
});

test("upload accepts jpeg and keeps the original extension", async () => {
  const token = await addAdmin();

  const uploaded = await send("/images/upload", {
    token,
    form: imageForm({ name: "photo.jpg", type: "image/jpeg" }),
  });
  assert.equal(uploaded.status, 201);
  assert.match(uploaded.body.url, /\.jpg$/);
  await fs.access(diskPathOf(uploaded.body.url));
});

test("upload rejects a missing file and non-image content with 400", async () => {
  const token = await addAdmin();

  const empty = new FormData();
  const missing = await send("/images/upload", { token, form: empty });
  assert.equal(missing.status, 400);

  for (const [name, type] of [
    ["script.svg", "image/svg+xml"],
    ["binary.exe", "application/octet-stream"],
    ["note.txt", "text/plain"],
  ] as const) {
    const before = new Set(await fs.readdir(uploadsDir));
    const rejected = await send("/images/upload", { token, form: imageForm({ name, type }) });
    assert.equal(rejected.status, 400, `${type} must be rejected`);
    // Отклонённый файл не должен осесть на диске.
    assert.deepEqual(await fs.readdir(uploadsDir), [...before]);
  }
});

test("upload larger than 10 MB is rejected as a client error, not a 500", async () => {
  const token = await addAdmin();

  const oversized = await send("/images/upload", {
    token,
    form: imageForm({ bytes: 10 * 1024 * 1024 + 1 }),
  });
  // 413 Payload Too Large (допустим и 400) — но никак не внутренняя ошибка.
  assert.ok(
    [400, 413].includes(oversized.status),
    `expected 400/413 for an oversized upload, got ${oversized.status}`,
  );
});

test("replace deletes the old file and stores the new one", async () => {
  const token = await addAdmin();
  const first = await send("/images/upload", { token, form: imageForm() });
  assert.equal(first.status, 201);

  const replaced = await send("/images/replace", {
    token,
    form: imageForm({ fields: { oldUrl: first.body.url } }),
  });
  assert.equal(replaced.status, 201);
  assert.notEqual(replaced.body.url, first.body.url);
  await fs.access(diskPathOf(replaced.body.url));
  await assert.rejects(fs.access(diskPathOf(first.body.url)), "the replaced file must be removed");
});

test("replace and delete cannot escape the uploads directory", async () => {
  const token = await addAdmin();
  // Файл-приманка за пределами uploads/ — при уязвимости к path traversal
  // именно он был бы удалён.
  const sentinel = path.resolve(`sentinel-${prefix}.txt`);
  await fs.writeFile(sentinel, "must survive");

  try {
    const traversalUrl = `/uploads/../${path.basename(sentinel)}`;

    const replaced = await send("/images/replace", {
      token,
      form: imageForm({ fields: { oldUrl: traversalUrl } }),
    });
    assert.ok(replaced.status < 500, `replace must not blow up, got ${replaced.status}`);
    await fs.access(sentinel);

    const deleted = await send("/images", { method: "DELETE", token, json: { url: traversalUrl } });
    assert.ok(deleted.status < 500, `delete must not blow up, got ${deleted.status}`);
    await fs.access(sentinel);
  } finally {
    await fs.unlink(sentinel).catch(() => {});
  }
});

test("delete removes the file, validates the url and stays idempotent", async () => {
  const token = await addAdmin();
  const uploaded = await send("/images/upload", { token, form: imageForm() });
  assert.equal(uploaded.status, 201);

  const deleted = await send("/images", { method: "DELETE", token, json: { url: uploaded.body.url } });
  assert.equal(deleted.status, 204);
  await assert.rejects(fs.access(diskPathOf(uploaded.body.url)), "the deleted file must be removed");

  const again = await send("/images", { method: "DELETE", token, json: { url: uploaded.body.url } });
  assert.equal(again.status, 204);

  const outside = await send("/images", { method: "DELETE", token, json: { url: "/etc/passwd" } });
  assert.equal(outside.status, 400);
});
