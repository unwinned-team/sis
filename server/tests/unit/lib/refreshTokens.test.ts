import assert from "node:assert/strict";
import test from "node:test";
import { REFRESH_TTL_MS } from "../../../src/lib/tokenTtl.js";

// refresh живёт 30 дней для всех ролей — админам подняли с 12ч до 30д,
// безопасность держит requireAdmin (БД на каждый запрос) и отзыв при
// деактивации, а не короткий TTL.
test("refresh session lasts 30 days", () => {
  assert.equal(REFRESH_TTL_MS, 30 * 24 * 60 * 60 * 1000);
});
