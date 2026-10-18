import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { appendComputed, appendOverride, latestHorizonLabels } from "./horizon-labels";
import type { HorizonResult } from "@/engine/horizon";

const result = (profile: HorizonResult["profile"]): HorizonResult => ({ profile, reasons: [profile], values: { yoyLatest: 20, marketCapUsd: 10_000_000_000 } });
const input = (day: number, profile: HorizonResult["profile"]) => ({ ticker: "NVDA", asOf: `2026-10-${String(day).padStart(2, "0")}`, sessionDate: `2026-10-${String(day).padStart(2, "0")}`, result: result(profile) });

it("holds a new profile for ten distinct sessions and ignores a same-day rerun", async () => {
  let prior: Record<string, unknown> | null = null;
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith("SELECT")) return { rows: prior ? [prior] : [] };
    if (sql.startsWith("INSERT")) {
      prior = { profile: params![2], candidate_profile: params![7], candidate_sessions: params![8], session_date: params![9] };
      return { rowCount: 1 };
    }
    return { rows: [] };
  });
  const db = { query } as unknown as pg.PoolClient;
  await appendComputed(db, input(1, "sustained"));
  for (let day = 2; day <= 10; day++) await appendComputed(db, input(day, "event"));
  expect(prior).toMatchObject({ profile: "sustained", candidate_profile: "event_driven", candidate_sessions: 9 });
  await appendComputed(db, { ...input(10, "event"), asOf: "2026-10-11" });
  expect(prior).toMatchObject({ profile: "sustained", candidate_sessions: 9 });
  await appendComputed(db, input(12, "event"));
  expect(prior).toMatchObject({ profile: "event_driven", candidate_profile: null, candidate_sessions: 0 });
});

it("allows a new filing to end the wait", async () => {
  const prior = { profile: "sustained", candidate_profile: "event_driven", candidate_sessions: 2, session_date: "2026-10-02" };
  const query = vi.fn(async (sql: string, params?: unknown[]) => sql.startsWith("SELECT") ? { rows: [prior] } : { rowCount: 1, params });
  await appendComputed({ query } as unknown as pg.PoolClient, { ...input(3, "event"), filingDate: "2026-10-03" });
  const args = query.mock.calls[1][1] as unknown[];
  expect(args.slice(2, 4)).toEqual(["event_driven", "event_driven"]);
  expect(args.slice(7, 9)).toEqual([null, 0]);
});

it("requires a dated reason for an override and retains computed numbers", async () => {
  const query = vi.fn(async (sql: string) => sql.startsWith("SELECT") ? { rows: [{ ticker: "NVDA", profile: "event_driven", input_values: { yoyLatest: 20 }, override_reason: "Reviewed", override_date: "2026-10-18" }] } : { rowCount: 1 });
  const db = { query } as unknown as pg.PoolClient;
  await expect(appendOverride(db, "NVDA", "2026-10-18", "event_driven", " ")).rejects.toThrow("reason");
  await appendOverride(db, "NVDA", "2026-10-18", "event_driven", "Reviewed");
  const rows = await latestHorizonLabels(db, "2026-10-18");
  expect(rows[0]).toMatchObject({ profile: "event_driven", input_values: { yoyLatest: 20 }, override_reason: "Reviewed" });
  expect(query.mock.calls.at(-1)?.[0]).toContain("kind='computed'");
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("horizon label migration", () => {
  it("applies migration 087 and rejects updates and deletes", async () => {
    const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    try {
      const migration = await db.query("SELECT 1 FROM schema_migrations WHERE name='087_horizon_labels.sql'");
      expect(migration.rowCount).toBe(1);
      await db.query("BEGIN");
      const ticker = (await db.query<{ ticker: string }>("SELECT ticker FROM instruments LIMIT 1")).rows[0]?.ticker;
      if (!ticker) throw new Error("Fixture instrument required");
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO horizon_labels (ticker,as_of,kind,profile,observed_profile,horizon_rules_version,session_date)
         VALUES ($1,'2026-10-18','computed','mixed','mixed','test','2026-10-18') RETURNING id`, [ticker]);
      const id = inserted.rows[0].id;
      await db.query("SAVEPOINT immutable");
      await expect(db.query("UPDATE horizon_labels SET profile='event_driven' WHERE id=$1", [id])).rejects.toThrow("append-only");
      await db.query("ROLLBACK TO SAVEPOINT immutable");
      await expect(db.query("DELETE FROM horizon_labels WHERE id=$1", [id])).rejects.toThrow("append-only");
      await db.query("ROLLBACK");
      await expect(db.query("TRUNCATE horizon_labels")).rejects.toThrow("append-only");
    } finally { await db.end(); }
  });
});
