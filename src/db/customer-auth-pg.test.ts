import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { recordBillingEvent } from "./billing-events";
import { getEntitlement, setEntitlement } from "./entitlements";
import { createUser, deleteUser, findUserByEmail, linkAccount, recordConsent } from "./users";

async function withScratchDb(run: (db: PGlite, pool: pg.Pool) => Promise<void>, extra: string[] = []) {
  const db = new PGlite();
  try {
    for (const name of ["001_initial.sql", "133_customer_auth.sql", "134_customer_entitlements.sql", ...extra]) {
      await db.exec(readFileSync(join(process.cwd(), "migrations", name), "utf8"));
    }
    const query = async (sql: string, params?: unknown[]) => {
      const result = await db.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    };
    const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool;
    await run(db, pool);
  } finally { await db.close(); }
}

const count = async (db: PGlite, table: string) => Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n);

describe("customer account schema (scratch Postgres)", () => {
  it("adopts a case variant email and hard deletes related account data", () => withScratchDb(async (db, pool) => {
    await db.query("INSERT INTO users (email) VALUES ('Old@Example.test')");
    const user = await createUser(pool, { email: "old@example.test" });
    expect(await findUserByEmail(pool, " OLD@example.test ")).toMatchObject({ id: user.id, email: "Old@Example.test" });
    expect(await count(db, "users")).toBe(1);
    expect(await linkAccount(pool, { userId: user.id, providerId: "google", accountId: "google-1" })).toBe(true);
    expect(await linkAccount(pool, { userId: user.id, providerId: "google", accountId: "google-1" })).toBe(false);
    await pool.query("INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, 'session-1', now() + interval '1 day')", [user.id]);
    await pool.query("INSERT INTO auth_verifications (identifier, value, expires_at) VALUES ('magic-link:hash', $1, now() + interval '15 minutes')", [JSON.stringify({ type: "magic-link", email: user.email })]);
    await pool.query("INSERT INTO subscriptions (user_id, status) VALUES ($1, 'legacy')", [user.id]);
    await recordConsent(pool, { userId: user.id, kind: "terms", version: "v1", granted: true });
    expect((await db.query("SELECT terms_version FROM users WHERE id = $1", [user.id])).rows[0]).toMatchObject({ terms_version: "v1" });
    await setEntitlement(pool, { userId: user.id, tier: "plus" });
    await recordBillingEvent(pool, { userId: user.id, provider: "stripe", eventId: "evt-1", type: "created", payload: { customer: "redacted" } });
    expect(await deleteUser(pool, user.id)).toBe(true);
    for (const table of ["users", "subscriptions", "auth_sessions", "auth_accounts", "auth_verifications", "user_consents", "entitlements", "billing_events"]) {
      expect(await count(db, table)).toBe(0);
    }
  }), 60_000);

  it("keeps one entitlement per user and handles expiry and event replay", () => withScratchDb(async (db, pool) => {
    const user = await createUser(pool, { email: "new@example.test" });
    expect((await getEntitlement(pool, user.id)).tier).toBe("free");
    await setEntitlement(pool, { userId: user.id, tier: "plus", endsAt: new Date(Date.now() + 60_000) });
    expect((await getEntitlement(pool, user.id)).tier).toBe("plus");
    await setEntitlement(pool, { userId: user.id, tier: "free" });
    expect(await count(db, "entitlements")).toBe(1);
    await setEntitlement(pool, { userId: user.id, tier: "plus", endsAt: new Date(Date.now() + 60_000) });
    expect((await getEntitlement(pool, user.id, new Date(Date.now() + 120_000))).tier).toBe("free");
    await pool.query("UPDATE entitlements SET status = 'canceled', cancel_at_period_end = true WHERE user_id = $1", [user.id]);
    expect((await getEntitlement(pool, user.id)).tier).toBe("plus");
    expect((await getEntitlement(pool, user.id, new Date(Date.now() + 120_000))).tier).toBe("free");
    const event = { userId: user.id, provider: "stripe", eventId: "evt-7", type: "created", payload: { ok: true } };
    expect(await recordBillingEvent(pool, event)).toBe(true);
    expect(await recordBillingEvent(pool, event)).toBe(false);
    expect(await count(db, "billing_events")).toBe(1);
  }), 60_000);

  it("accepts the Passive plan only after migration 139", async () => {
    await withScratchDb(async (_db, pool) => {
      const user = await createUser(pool, { email: "before@example.test" });
      await expect(setEntitlement(pool, { userId: user.id, tier: "passive" })).rejects.toThrow(/entitlements_tier_check/);
    });
    await withScratchDb(async (_db, pool) => {
      const user = await createUser(pool, { email: "passive@example.test" });
      await setEntitlement(pool, { userId: user.id, tier: "passive" });
      expect((await getEntitlement(pool, user.id)).tier).toBe("passive");
      await setEntitlement(pool, { userId: user.id, tier: "plus" });
      expect((await getEntitlement(pool, user.id)).tier).toBe("plus");
      await expect(pool.query("UPDATE entitlements SET tier = 'gold' WHERE user_id = $1", [user.id])).rejects.toThrow(/entitlements_tier_check/);
    }, ["139_entitlements_passive.sql"]);
  }, 60_000);

  it("uses indexes for email, session and entitlement lookups", () => withScratchDb(async (db, pool) => {
    const user = await createUser(pool, { email: "plan@example.test" });
    await setEntitlement(pool, { userId: user.id, tier: "plus" });
    await db.exec("SET enable_seqscan = off");
    const explain = async (sql: string, params: unknown[]) => (await db.query<Record<string, string>>(`EXPLAIN ${sql}`, params)).rows.map((row) => Object.values(row).join(" ")).join("\n");
    expect(await explain("SELECT id FROM users WHERE lower(email) = $1", ["plan@example.test"])).toContain("users_email_lower_idx");
    expect(await explain("SELECT user_id FROM auth_sessions WHERE token = $1", ["session-1"])).toContain("auth_sessions_token_key");
    expect(await explain("SELECT tier FROM entitlements WHERE user_id = $1", [user.id])).toMatch(/entitlements_(pkey|user_ends_idx)/);
  }), 60_000);
});
