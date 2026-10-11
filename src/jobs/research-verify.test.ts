import { beforeEach, describe, expect, it } from "vitest";
import { resetGuardState, type Transport } from "../research/fetch-guard";
import { runResearchVerify } from "./research-verify";

const QUOTE = "The company raised its full year revenue outlook to between 4.1 and 4.3 billion dollars on strong demand.";
const transport: Transport = async ({ url }) => url.pathname === "/ok"
  ? new Response(`<p>${QUOTE}</p>`, { headers: { "content-type": "text/html" } })
  : new Response("no", { status: 403 });

function db(ready = { tables: true, source: true }) {
  const updates: unknown[][] = [];
  let counted = false;
  return {
    updates, get counted() { return counted; },
    async query(sql: string, params: unknown[] = []) {
      if (/to_regclass/.test(sql)) return { rows: [ready] };
      if (/FROM research_findings WHERE verification_status = 'pending'/.test(sql)) return { rows: [
        { id: "1", run_id: "r1", symbol: "VRT", evidence: [{ url: "https://www.reuters.com/ok", quote: QUOTE, publishedAt: null, sourceName: "R", sourceClassHint: "press" }] },
        { id: "2", run_id: "r1", symbol: "VRT", evidence: [{ url: "https://www.reuters.com/blocked", quote: QUOTE, publishedAt: null, sourceName: "R", sourceClassHint: "press" }] },
      ] };
      if (/UPDATE research_findings/.test(sql)) { updates.push(params); return { rows: [] }; }
      if (/UPDATE research_runs/.test(sql)) { counted = true; return { rows: [] }; }
      return { rows: [] };
    },
  };
}

beforeEach(() => resetGuardState());

describe("runResearchVerify", () => {
  const deps = { transport, resolve: async () => ["93.184.216.34"], wait: async () => {}, now: () => new Date("2026-10-10T00:00:00Z") };
  it("writes a result for every pending finding and never fails on a failed fetch", async () => {
    const fake = db();
    const result = await runResearchVerify(fake as never, deps);
    expect(result).toMatchObject({ findings: 2, verified: 1, confirmed: 0, failed: 0 });
    expect(fake.updates.map((p) => p[1])).toEqual(["verified", "fetch_failed"]);
    expect(fake.updates[0][7]).toBe("one model reading checked against the quote");
    expect(fake.updates[0][8]).toBe(false);
    expect(fake.counted).toBe(true);
  });
  it("skips cleanly while the tables or the source row are missing", async () => {
    const result = await runResearchVerify(db({ tables: false, source: false }) as never, deps);
    expect(result.skipped).toMatch(/not migrated/);
    expect(result.findings).toBe(0);
  });
});
