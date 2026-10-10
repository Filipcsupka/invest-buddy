import { randomBytes } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { getLatestSnapshot, getSnapshot, hashBody, MAX_SNAPSHOT_BYTES, putSnapshot, SnapshotTooLarge } from "./raw-store";

describe("raw store (no database)", () => {
  it("hash is stable and depends on bytes only", () => {
    expect(hashBody("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashBody(Buffer.from("abc"))).toBe(hashBody("abc"));
    expect(hashBody("abd")).not.toBe(hashBody("abc"));
  });
  it("rejects a body over 20 MB before any query", async () => {
    const db = { query: async () => { throw new Error("must not query"); } } as unknown as pg.Pool;
    const body = Buffer.alloc(MAX_SNAPSHOT_BYTES + 1);
    await expect(putSnapshot(db, { sourceId: "sec", key: "k", body, contentType: "application/json" })).rejects.toBeInstanceOf(SnapshotTooLarge);
  });
});

const KEY = "raw-store-test";
/** Needs a migrated TEST_DATABASE_URL. Uses the seeded 'sec' source and a test-only key; cleans up after itself. */
describe("raw store (Postgres)", () => {
  async function withPool(fn: (pool: pg.Pool) => Promise<void>) {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
    try { await pool.query("DELETE FROM raw_snapshots WHERE key LIKE $1", [`${KEY}%`]); await fn(pool); }
    finally { await pool.query("DELETE FROM raw_snapshots WHERE key LIKE $1", [`${KEY}%`]); await pool.end(); }
  }
  const count = async (pool: pg.Pool) => Number((await pool.query("SELECT count(*) AS n FROM raw_snapshots WHERE key LIKE $1", [`${KEY}%`])).rows[0].n);

  it.skipIf(!process.env.TEST_DATABASE_URL)("same body twice stores one row", () => withPool(async (pool) => {
    const input = { sourceId: "sec", key: KEY, body: '{"a":1}', contentType: "application/json" };
    const first = await putSnapshot(pool, input);
    const second = await putSnapshot(pool, input);
    expect(first.stored).toBe(true);
    expect(second).toMatchObject({ stored: false, id: first.id, contentHash: first.contentHash });
    expect(await count(pool)).toBe(1);
    await putSnapshot(pool, { ...input, body: '{"a":2}' });
    expect(await count(pool)).toBe(2);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("1 MB JSON round-trips byte for byte", () => withPool(async (pool) => {
    const json = JSON.stringify({ rows: Array.from({ length: 20000 }, (_, i) => ({ i, text: `value ${i} é ✓`, n: i / 7 })) }).padEnd(1024 * 1024, " ");
    const original = Buffer.from(json, "utf8");
    expect(original.length).toBeGreaterThanOrEqual(1024 * 1024);
    const put = await putSnapshot(pool, { sourceId: "sec", key: `${KEY}-1mb`, body: json, contentType: "application/json", meta: { cik: "0001045810" } });
    const got = await getSnapshot(pool, put.id);
    expect(got?.body.equals(original)).toBe(true);
    expect(got).toMatchObject({ sizeBytes: original.length, contentHash: hashBody(original), contentType: "application/json", meta: { cik: "0001045810" } });
    const stored = Number((await pool.query("SELECT octet_length(body) AS n FROM raw_snapshots WHERE id=$1", [put.id])).rows[0].n);
    expect(stored).toBeLessThan(original.length);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("binary bodies round-trip and oversize is rejected without a row", () => withPool(async (pool) => {
    const bytes = randomBytes(4096);
    const put = await putSnapshot(pool, { sourceId: "sec", key: `${KEY}-bin`, body: bytes, contentType: "application/octet-stream" });
    expect((await getSnapshot(pool, put.id))?.body.equals(bytes)).toBe(true);
    const before = await count(pool);
    await expect(putSnapshot(pool, { sourceId: "sec", key: `${KEY}-big`, body: Buffer.alloc(MAX_SNAPSHOT_BYTES + 1), contentType: "text/plain" })).rejects.toBeInstanceOf(SnapshotTooLarge);
    expect(await count(pool)).toBe(before);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("latest snapshot per key and unknown id", () => withPool(async (pool) => {
    await putSnapshot(pool, { sourceId: "sec", key: `${KEY}-latest`, body: "old", contentType: "text/plain", fetchedAt: new Date("2031-01-01T00:00:00Z") });
    await putSnapshot(pool, { sourceId: "sec", key: `${KEY}-latest`, body: "new", contentType: "text/plain", fetchedAt: new Date("2031-01-02T00:00:00Z") });
    expect((await getLatestSnapshot(pool, "sec", `${KEY}-latest`))?.body.toString()).toBe("new");
    expect(await getLatestSnapshot(pool, "sec", `${KEY}-none`)).toBeNull();
    expect(await getSnapshot(pool, 2 ** 40)).toBeNull();
  }));
});
