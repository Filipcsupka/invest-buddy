import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { recordBillingEvent } from "./billing-events";
import { setEntitlement } from "./entitlements";
import { createUser } from "./users";

/** Requires a scratch, migrated TEST_DATABASE_URL. Every write rolls back. */
describe.skipIf(!process.env.TEST_DATABASE_URL)("customer account schema (Postgres)", () => {
  it("enforces one entitlement and idempotent events, then cascades on delete", async () => {
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const user = await createUser(client, { email: `schema-${randomUUID()}@example.test` });
      await setEntitlement(client, { userId: user.id, tier: "plus" });
      await setEntitlement(client, { userId: user.id, tier: "free" });
      expect(Number((await client.query("SELECT count(*) AS n FROM entitlements WHERE user_id = $1", [user.id])).rows[0].n)).toBe(1);
      const event = { userId: user.id, provider: "stripe", eventId: randomUUID(), type: "test", payload: { ok: true } };
      expect(await recordBillingEvent(client, event)).toBe(true);
      expect(await recordBillingEvent(client, event)).toBe(false);
      await client.query("DELETE FROM users WHERE id = $1", [user.id]);
      expect(Number((await client.query("SELECT count(*) AS n FROM billing_events WHERE user_id = $1", [user.id])).rows[0].n)).toBe(0);
      expect(Number((await client.query("SELECT count(*) AS n FROM entitlements WHERE user_id = $1", [user.id])).rows[0].n)).toBe(0);
    } finally {
      try { await client.query("ROLLBACK"); } finally { await client.end(); }
    }
  });
});
