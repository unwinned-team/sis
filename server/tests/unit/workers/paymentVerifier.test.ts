import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

test("verifies a scheduled PENDING CARD payment without a webhook claim", async (t) => {
  process.env.DATABASE_URL ??= "postgresql://localhost:5432/test";
  const previousDbUrl = process.env.DATABASE_URL;
  const previousToken = process.env.MONOBANK_TOKEN;
  process.env.MONOBANK_TOKEN = "test-token";
  t.after(() => {
    if (previousToken === undefined) delete process.env.MONOBANK_TOKEN;
    else process.env.MONOBANK_TOKEN = previousToken;
    if (previousDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDbUrl;
  });

  const { default: prisma } = await import("../../../src/prisma.js");
  const { verifyClaimedPayments } = await import("../../../src/workers/paymentVerifier.js");

  const order = {
    id: "pending-order",
    customerId: "customer",
    totalAmount: new Prisma.Decimal("10.00"),
    paymentMethod: "CARD" as const,
    status: "NEW" as const,
    paymentStatus: "PENDING" as const,
    paymentRef: "ICE-AB12CD34",
    paymentAmount: new Prisma.Decimal("10.00"),
    paymentAmountKey: "10.00",
    verifyAttempts: 0,
    nextCheckAt: new Date(),
    deliveryCity: null,
    deliveryRegion: null,
    deliveryBranch: null,
    createdAt: new Date(),
  };

  // Prisma delegate is a Proxy and is incompatible with node:test mock.method.
  const orderDelegate = prisma.order as typeof prisma.order;
  const originalFindMany = orderDelegate.findMany;
  const originalUpdateMany = orderDelegate.updateMany;
  t.after(() => {
    orderDelegate.findMany = originalFindMany;
    orderDelegate.updateMany = originalUpdateMany;
  });

  orderDelegate.findMany = (async (args: Prisma.OrderFindManyArgs) => {
    assert.deepEqual(args.where?.paymentStatus, { in: ["PENDING", "CLAIMED"] });
    return [order];
  }) as typeof orderDelegate.findMany;
  const updates: Prisma.OrderUpdateManyArgs[] = [];
  orderDelegate.updateMany = (async (args: Prisma.OrderUpdateManyArgs) => {
    updates.push(args);
    return { count: 1 };
  }) as unknown as typeof orderDelegate.updateMany;
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify([
        { id: "payment", time: Math.floor(Date.now() / 1000), amount: 1_000, comment: "" },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  await verifyClaimedPayments();

  assert.equal(updates.length, 1);
  const updateArgs = updates[0]!;
  assert.deepEqual(updateArgs.where?.paymentStatus, { in: ["PENDING", "CLAIMED"] });
  assert.equal(updateArgs.data.paymentStatus, "PAID");
  assert.equal(updateArgs.data.paymentAmountKey, null);
  assert.equal(updateArgs.data.nextCheckAt, null);
});
