import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresWaitlistRepository, type SignupInput } from "./waitlist";

/** One dedicated client, so BEGIN and ROLLBACK wrap everything. Needs a migrated TEST_DATABASE_URL. */
async function inRollback(fn: (client: pg.Client, repo: PostgresWaitlistRepository) => Promise<void>) {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try { await client.query("BEGIN"); await fn(client, new PostgresWaitlistRepository(client)); } finally { try { await client.query("ROLLBACK"); } finally { await client.end(); } }
}

const signup = (over: Partial<SignupInput> = {}): SignupInput => ({ email: "Person@Example.test", locale: "en", consentLaunch: true, consentWeekly: false, consentTextVersion: "v0", tokenHash: "hash-1", ...over });

describe.skipIf(!process.env.TEST_DATABASE_URL)("waitlist_signups (Postgres)", () => {
  it("folds case and does not send a second mail inside 24 hours", () => inRollback(async (client, repo) => {
    expect(await repo.create(signup())).toEqual({ id: expect.any(Number) });
    expect(await repo.create(signup({ email: " person@example.TEST ", tokenHash: "hash-2" }))).toEqual({});
    expect(Number((await client.query("SELECT count(*) AS n FROM waitlist_signups WHERE email = 'person@example.test'")).rows[0].n)).toBe(1);
    // After 24 hours a repeat sign-up gets a fresh token.
    await client.query("UPDATE waitlist_signups SET confirmation_sent_at = now() - interval '25 hours'");
    expect(await repo.create(signup({ tokenHash: "hash-3" }))).toEqual({ id: expect.any(Number) });
    expect(await repo.confirm("hash-1")).toEqual({ status: "invalid" });
    expect((await repo.confirm("hash-3")).status).toBe("confirmed");
  }));

  it("rejects an upper-case address written straight to the table", () => inRollback(async (client) => {
    await expect(client.query("INSERT INTO waitlist_signups (email, locale, consent_launch, consent_text_version) VALUES ('A@b.test', 'en', true, 'v0')")).rejects.toThrow(/check/i);
  }));

  it("moves pending to confirmed to unsubscribed, and repeats are harmless", () => inRollback(async (client, repo) => {
    await repo.create(signup());
    expect(await repo.peekConfirm("hash-1")).toBe("valid");
    const first = await repo.confirm("hash-1");
    expect(first.status).toBe("confirmed");
    expect((await repo.confirm("hash-1")).status).toBe("already");
    // A confirmed address is not mailed again by a repeat sign-up.
    await client.query("UPDATE waitlist_signups SET confirmation_sent_at = now() - interval '2 days'");
    expect(await repo.create(signup({ tokenHash: "hash-9" }))).toEqual({});
    const id = first.status === "confirmed" ? first.person.id : 0;
    expect((await repo.unsubscribe(id)).status).toBe("unsubscribed");
    expect((await repo.unsubscribe(id)).status).toBe("already");
    expect((await repo.unsubscribe(id + 100000)).status).toBe("invalid");
    expect((await repo.confirm("hash-1")).status).toBe("invalid");
    const row = (await client.query("SELECT status, confirmed_at, unsubscribed_at FROM waitlist_signups")).rows[0];
    expect(row.status).toBe("unsubscribed");
    expect(row.confirmed_at).toBeInstanceOf(Date);
    expect(row.unsubscribed_at).toBeInstanceOf(Date);
  }));

  it("lets a sign-up send again after a failed send", () => inRollback(async (_client, repo) => {
    const first = await repo.create(signup());
    expect(await repo.create(signup({ tokenHash: "hash-2" }))).toEqual({});
    await repo.releaseConfirmation(first.id!);
    expect(await repo.create(signup({ tokenHash: "hash-3" }))).toEqual({ id: first.id });
  }));

  it("expires a confirm token after 7 days", () => inRollback(async (client, repo) => {
    await repo.create(signup());
    await client.query("UPDATE waitlist_signups SET token_expires_at = now() - interval '1 minute'");
    expect(await repo.peekConfirm("hash-1")).toBe("expired");
    expect((await repo.confirm("hash-1")).status).toBe("expired");
  }));

  it("counts by status, locale, source and variant", () => inRollback(async (client, repo) => {
    const before = (await repo.counts()).reduce((n, row) => n + row.count, 0);
    await repo.create(signup({ email: "a@example.test", tokenHash: "a", locale: "sk", source: "landing", priceVariant: "9.90" }));
    await repo.create(signup({ email: "b@example.test", tokenHash: "b", source: "pricing" }));
    const rows = await repo.counts();
    expect(rows.reduce((n, row) => n + row.count, 0)).toBe(before + 2);
    expect(rows).toContainEqual(expect.objectContaining({ status: "pending", locale: "sk", source: "landing", priceVariant: "9.90" }));
    void client;
  }));
});
