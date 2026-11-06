import { describe, expect, it } from "vitest";
import type pg from "pg";
import { macroReleaseFacts, ownerMacroReleaseLine, releaseFact, releaseKindsOn } from "./macro-release";

const DATE = "2026-11-10";
const observations = [{ date: "2026-09-01", value: 324.1 }, { date: "2026-10-01", value: 324.6 }];

describe("macro release facts", () => {
  it("records actual, prior and the index-point change for a scheduled release", () => {
    expect(releaseFact("CPI", DATE, observations)).toEqual({ kind: "CPI", seriesId: "CPIAUCSL", releaseDate: DATE,
      observationDate: "2026-10-01", actual: 324.6, prior: 324.1, change: 0.5, sourceUrl: "https://fred.stlouisfed.org/series/CPIAUCSL" });
    expect(ownerMacroReleaseLine([releaseFact("CPI", DATE, observations)!])).toBe("Macro releases: CPI 324.6 (prior 324.1, change +0.5 index points).");
  });

  it("does not label an old FRED observation as the scheduled release", () => {
    expect(releaseFact("CPI", DATE, observations.slice(0, 1))).toBeNull();
    expect(releaseFact("CPI", DATE, [{ date: "2026-08-01", value: 323 }, observations[0]])).toBeNull();
    expect(ownerMacroReleaseLine([])).toBeNull();
  });

  it("uses the stored schedule when deployed, including a moved release date", async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("to_regclass")) return { rows: [{ present: "macro_events" }] };
      return { rows: [{ kind: "PPI", date: DATE }, { kind: "CPI", date: "2026-11-11" }] };
    } } as unknown as Pick<pg.Pool, "query">;
    expect(await releaseKindsOn(db, DATE)).toEqual(["PPI"]);
    expect(queries[1]).toContain("macro_events");
  });

  it("falls back to the static calendar before P1 is deployed", async () => {
    const db = { query: async () => ({ rows: [{ present: null }] }) } as unknown as Pick<pg.Pool, "query">;
    expect(await releaseKindsOn(db, DATE)).toEqual(["CPI"]);
    expect(await releaseKindsOn(db, "2026-11-11")).toEqual([]);
  });

  it("reads the stored FRED observations only for the release-day series", async () => {
    const db = { query: async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ present: null }] };
      if (sql.includes("macro_observations")) return { rows: [...observations].reverse() };
      throw new Error(`unexpected query: ${sql}`);
    } } as unknown as Pick<pg.Pool, "query">;
    expect(await macroReleaseFacts(db, DATE)).toMatchObject([{ kind: "CPI", actual: 324.6, prior: 324.1 }]);
  });
});
