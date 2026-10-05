import { describe, expect, it } from "vitest";
import { purgeIdeas } from "./retention-ideas";

const client = (counts: Record<string, number>) => { const sql: string[] = []; return { sql, query: async (q: string) => { sql.push(q); const n = q.includes("trade_ideas") ? counts.ideas : counts.runs; return { rows: [{ count: n }], rowCount: n }; } }; };

describe("idea retention", () => {
  it("deletes expired ideas and judge runs", async () => {
    const c = client({ ideas: 3, runs: 5 });
    expect(await purgeIdeas(c, false)).toEqual({ tradeIdeas: 3, judgeRuns: 5 });
    expect(c.sql).toEqual(["DELETE FROM trade_ideas WHERE expires_at < now()", "DELETE FROM judge_runs WHERE expires_at < now()"]);
  });
  it("only counts on a dry run", async () => {
    const c = client({ ideas: 2, runs: 1 });
    expect(await purgeIdeas(c, true)).toEqual({ tradeIdeas: 2, judgeRuns: 1 });
    expect(c.sql.every((q) => q.startsWith("SELECT count(*)"))).toBe(true);
  });
});
