import assert from "node:assert/strict";
import test from "node:test";
import { registerSchema, loginSchema } from "../../../src/schemas/auth.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../../../src/schemas/customers.js";

test("auth schemas normalize email before use", () => {
  const register = registerSchema.parse({
    name: "Customer",
    email: "  User@Example.COM  ",
    password: "password-123",
  });
  const login = loginSchema.parse({
    email: "  User@Example.COM  ",
    password: "password-123",
  });

  assert.equal(register.email, "user@example.com");
  assert.equal(login.email, "user@example.com");
});

test("customer schemas normalize email consistently", () => {
  const created = createCustomerSchema.parse({
    name: "Customer",
    email: "  User@Example.COM  ",
  });
  const updated = updateCustomerSchema.parse({ email: "  Other@Example.COM  " });

  assert.equal(created.email, "user@example.com");
  assert.equal(updated.email, "other@example.com");
});

test("auth schemas reject oversized input", () => {
  assert.equal(
    registerSchema.safeParse({
      name: "x".repeat(201),
      email: "user@example.com",
      password: "password-123",
    }).success,
    false,
  );
  assert.equal(
    loginSchema.safeParse({
      email: "user@example.com",
      password: "x".repeat(129),
    }).success,
    false,
  );
});
