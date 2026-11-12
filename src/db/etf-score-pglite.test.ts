import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { storeEtfScore } from "./etf-score";
import type { EtfScoreResult } from "@/engine/etf-score";

it("enforces score bounds and replaces a daily result atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE etf_catalog (listing_key text PRIMARY KEY); INSERT INTO etf_catalog VALUES ('TEST')");
    await db.exec(readFileSync("migrations/138_etf_scores.sql", "utf8"));
    const score: EtfScoreResult = { rulesVersion: "test", rules: [], earned: 10, evidencedMax: 20, percent: null, state: "not_rated", rejections: ["insufficient_evidence"], concentration: { concentrated: false, topTenWeightPct: null, maxCountryWeightPct: null, maxSectorWeightPct: null, holdingsCount: null } };
    const query = { query: (sql: string, values?: unknown[]) => db.query(sql, values) };
    await storeEtfScore("TEST", "2026-11-12", score, query as never);
    await storeEtfScore("TEST", "2026-11-12", { ...score, earned: 15 }, query as never);
    expect((await db.query("SELECT earned,evidenced_max FROM etf_scores")).rows).toEqual([{ earned: 15, evidenced_max: 20 }]);
    await expect(storeEtfScore("TEST", "2026-11-12", { ...score, earned: 21 }, query as never)).rejects.toThrow(/check constraint/i);
    expect((await db.query("SELECT earned FROM etf_scores")).rows).toEqual([{ earned: 15 }]);
    await expect(storeEtfScore("UNKNOWN", "2026-11-12", score, query as never)).rejects.toThrow(/foreign key/i);
  } finally { await db.close(); }
});
