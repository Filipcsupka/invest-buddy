import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresDeliveryLog } from "./notifications";

describe.skipIf(!process.env.TEST_DATABASE_URL)("notification_deliveries (Postgres)", () => {
  it("claims a day once, and a released claim can be claimed again", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      const log = new PostgresDeliveryLog(pool);
      const key = { channel: "telegram" as const, target: `@test-${Date.now()}`, asOf: "2026-10-09", kind: "digest:sk" };
      expect(await log.claim(key, 3)).toBe(true);
      expect(await log.claim(key, 3)).toBe(false);
      await log.release(key);
      expect(await log.claim(key, 3)).toBe(true);
      await log.release(key);
    } finally { await pool.end(); }
  });
});
