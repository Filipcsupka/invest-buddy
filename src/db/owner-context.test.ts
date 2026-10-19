import { describe, expect, it } from "vitest";
import { MACRO_EVENTS } from "../data/macro-calendar";
import { loadOwnerContext, nextMacroEvents } from "./owner-context";

describe("owner context loader (P7)", () => {
  it("picks every macro event on the next macro date", () => {
    expect(nextMacroEvents("2026-10-19", MACRO_EVENTS)).toEqual([{ date: "2026-10-28", kind: "FOMC", label: "FOMC decision", sessions: 7 }]);
    const sameDay = [...MACRO_EVENTS, { date: "2026-10-28", kind: "CPI" as const, label: "CPI (September)" }];
    expect(nextMacroEvents("2026-10-19", sameDay).map((e) => e.kind)).toEqual(["CPI", "FOMC"]);
    expect(nextMacroEvents("2027-06-01", MACRO_EVENTS)).toEqual([]);
  });

  it("degrades to empty parts when tables are missing and still gives the macro fallback", async () => {
    const db = { query: async () => { throw new Error('relation "earnings_calendar_snapshots" does not exist'); } };
    const context = (await loadOwnerContext(db as never, ["SMPL"], "2026-10-19")).get("SMPL");
    expect(context).toEqual({ nextCatalyst: null, macro: [{ date: "2026-10-28", kind: "FOMC", label: "FOMC decision", sessions: 7 }], graduation: null, revision: null });
  });

  it("reads stored catalysts and revisions for the owner and skips owner-only reads for the public", async () => {
    const seen: string[] = [];
    const db = { query: async (sql: string) => {
      seen.push(sql);
      if (sql.includes("WITH seen AS")) return { rows: [{ ticker: "SMPL", observedOn: "2026-10-19", reportDate: "2026-11-05", fiscalDateEnding: "2026-09-30", timeOfDay: "post-market" }] };
      if (sql.includes('AS "latestPull"')) return { rows: [{ latestPull: "2026-10-19" }] };
      if (sql.includes("FROM research_findings")) return { rows: [] };
      if (sql.includes("estimate::float8")) return { rows: [
        { ticker: "SMPL", observedOn: "2026-09-19", reportDate: "2026-11-05", fiscalDateEnding: "2026-09-30", estimate: 1.18 },
        { ticker: "SMPL", observedOn: "2026-10-19", reportDate: "2026-11-05", fiscalDateEnding: "2026-09-30", estimate: 1.23 },
      ] };
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    } };
    const owner = (await loadOwnerContext(db as never, ["SMPL", "SMPL"], "2026-10-19")).get("SMPL")!;
    expect(owner.nextCatalyst).toMatchObject({ type: "earnings", date: "2026-11-05", daysUntil: 17, timeOfDay: "post-market" });
    expect(owner.revision?.windows[0]).toMatchObject({ days: 30, change: 0.05, direction: "up" });
    seen.length = 0;
    const pub = (await loadOwnerContext(db as never, ["SMPL"], "2026-10-19", { audience: "public" })).get("SMPL")!;
    expect(pub).toMatchObject({ graduation: null, revision: null });
    expect(seen.some((sql) => sql.includes("estimate::float8") || sql.includes("score_results"))).toBe(false);
  });

  it("makes no query without symbols", async () => {
    const db = { query: async () => { throw new Error("queried"); } };
    expect((await loadOwnerContext(db as never, [], "2026-10-19")).size).toBe(0);
  });
});
