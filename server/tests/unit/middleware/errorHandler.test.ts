import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import errorHandler from "../../../src/middleware/errorHandler.js";
import { httpError } from "../../../src/lib/httpError.js";

function handle(err: unknown) {
  let statusCode: number | undefined;
  let payload: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    },
  };
  errorHandler(err, {} as Request, res as unknown as Response, () => {});
  return { statusCode, payload };
}

test("unique constraint violation (P2002) maps to 409", () => {
  const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`slug`)", {
    code: "P2002",
    clientVersion: Prisma.prismaVersion.client,
  });
  const { statusCode, payload } = handle(err);
  assert.equal(statusCode, 409);
  assert.deepEqual(payload, { error: "A unique value already exists" });
});

test("httpError status and message pass through for client errors", () => {
  const { statusCode, payload } = handle(httpError(404, "Category not found"));
  assert.equal(statusCode, 404);
  assert.deepEqual(payload, { error: "Category not found" });
});

test("errors without a status become an opaque 500", () => {
  const { statusCode, payload } = handle(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
  assert.equal(statusCode, 500);
  // Внутренности (адреса, SQL, стектрейсы) не должны утекать клиенту.
  assert.deepEqual(payload, { error: "Internal server error" });
});

test("5xx httpError messages are hidden from the client", () => {
  const { statusCode, payload } = handle(httpError(502, "upstream database node db-3 is down"));
  assert.equal(statusCode, 502);
  assert.deepEqual(payload, { error: "Internal server error" });
});
