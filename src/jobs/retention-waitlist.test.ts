import pg from "pg";
import { describe, expect, it } from "vitest";
import { purgeUnconfirmedWaitlist } from "./retention-waitlist";

describe("purgeUnconfirmedWaitlist", () => {
  it("counts on a dry run and deletes otherwise", async () => {
    const sql: string[] = [];
    const client = { query: async (q: string) => { sql.push(q); return { rows: [{ count: 2 }], rowCount: 2 }; } };
    expect(await purgeUnconfirmedWaitlist(client, true)).toBe(2);
    expect(await purgeUnconfirmedWaitlist(client, false)).toBe(2);
    expect(sql).toEqual([
      "SELECT count(*)::int AS count FROM waitlist_signups WHERE status = 'pending' AND created_at < now() - interval '14 days'",
      "DELETE FROM waitlist_signups WHERE status = 'pending' AND created_at < now() - interval '14 days'",
    ]);
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("deletes only pending rows older than 14 days (Postgres)", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insert = (email: string, status: string, age: string) => client.query(
        `INSERT INTO waitlist_signups (email, locale, consent_launch, consent_text_version, status, created_at) VALUES ($1, 'en', true, 'v0', $2, now() - $3::interval)`, [email, status, age]);
      await insert("old-pending@example.test", "pending", "15 days");
      await insert("new-pending@example.test", "pending", "13 days");
      await insert("old-confirmed@example.test", "confirmed", "30 days");
      await insert("old-unsub@example.test", "unsubscribed", "30 days");
      const before = Number((await client.query("SELECT count(*) AS n FROM waitlist_signups WHERE email LIKE '%@example.test'")).rows[0].n);
      expect(before).toBe(4);
      expect(await purgeUnconfirmedWaitlist(client, true)).toBeGreaterThanOrEqual(1);
      await purgeUnconfirmedWaitlist(client, false);
      const left = await client.query("SELECT email FROM waitlist_signups WHERE email LIKE '%@example.test' ORDER BY email");
      expect(left.rows.map((r) => r.email)).toEqual(["new-pending@example.test", "old-confirmed@example.test", "old-unsub@example.test"]);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
