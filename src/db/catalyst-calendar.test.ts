import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { readCatalystCalendar, readHeldSymbols } from "./catalyst-calendar";

describe("readCatalystCalendar (stubbed queries)", () => {
  it("joins the four reads and passes symbols, horizon and asOf to SQL", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const query = async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("max(observed_on)::text")) return { rows: [{ latestPull: "2026-10-19" }] };
      if (sql.includes("WITH seen")) return { rows: [
        { ticker: "NVDA", observedOn: "2026-10-19", reportDate: "2026-10-22", fiscalDateEnding: "2026-09-30", timeOfDay: "post-market" },
        { ticker: "NVDA", observedOn: "2026-10-12", reportDate: "2026-10-29", fiscalDateEnding: "2026-09-30", timeOfDay: "post-market" },
      ] };
      if (sql.includes("FROM research_findings")) return { rows: [
        { id: 4, symbol: "NVDA", kind: "product", claim: "Launch event on 2026-11-03", eventDate: "2026-11-03", confirmed: true, dedupeKey: "k", verifiedAt: "2026-10-18T09:00:00.000000Z" },
      ] };
      if (sql.includes("FROM portfolio_baseline")) return { rows: [{ symbol: "NVDA" }] };
      if (sql.includes("FROM research_candidates")) return { rows: [] };
      return { rows: [] };
    };
    const view = await readCatalystCalendar({ query } as never, "2026-10-19", { symbols: ["NVDA"], horizonDays: 30 });
    expect(view.latestPull).toBe("2026-10-19");
    expect(view.next).toEqual([expect.objectContaining({ ticker: "NVDA", reportDate: "2026-10-22", previousReportDate: "2026-10-29", stale: false })]);
    expect(view.events.map((e) => [e.type, e.date])).toEqual([["earnings", "2026-10-22"], ["research", "2026-11-03"]]);
    expect(view.preEarnings).toEqual([{ symbol: "NVDA", reason: "held", reportDate: "2026-10-22", timeOfDay: "post-market", daysUntil: 3, stale: false }]);
    expect(calls.find((c) => c.sql.includes("WITH seen"))!.params).toEqual(["2026-10-19", ["NVDA"]]);
    expect(calls.find((c) => c.sql.includes("FROM research_findings"))!.params).toEqual(["2026-10-19", 30, ["NVDA"]]);
  });

  it("reads held symbols only, never quantities or EUR values", async () => {
    let seen = "";
    const query = async (sql: string) => { seen = sql; return { rows: [{ symbol: "AMD" }] }; };
    expect(await readHeldSymbols({ query } as never, "2026-10-19")).toEqual(["AMD"]);
    expect(seen).toContain("p->>'symbol'");
    expect(seen).not.toMatch(/valueEur|quantity|cash_eur/);
  });
});

/** One client, so BEGIN and ROLLBACK wrap every row. Needs a migrated TEST_DATABASE_URL. Dates in 2099 keep other tests' rows out. */
describe.skipIf(!process.env.TEST_DATABASE_URL)("readCatalystCalendar (Postgres)", () => {
  it("reads next earnings, a moved date, future verified findings and pre-earnings flags", async () => {
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('CCAL1','Calendar one','Test','guide'),('CCAL2','Calendar two','Test','guide'),('CCAL3','Calendar three','Test','guide') ON CONFLICT DO NOTHING");
      const insert = `INSERT INTO earnings_calendar_snapshots (observed_on,ticker,report_date,fiscal_date_ending,time_of_day,source_id) VALUES ($1,$2,$3,$4,$5,'alphavantage')`;
      await client.query(insert, ["2099-01-05", "CCAL1", "2099-01-20", "2098-12-31", "post-market"]);
      await client.query(insert, ["2099-01-10", "CCAL1", "2099-01-14", "2098-12-31", "pre-market"]);
      await client.query(insert, ["2099-01-10", "CCAL1", "2099-04-20", "2099-03-31", "pre-market"]);
      await client.query(insert, ["2099-01-10", "CCAL2", "2099-01-12", "2098-12-31", null]);
      await client.query(insert, ["2099-01-05", "CCAL3", "2099-01-15", "2098-12-31", "post-market"]);
      await client.query(insert, ["2099-01-11", "CCAL1", "2099-01-14", "2098-12-31", "pre-market"]);

      const runId = randomUUID();
      await client.query("INSERT INTO research_runs (id,run_type,as_of,adapter,status) VALUES ($1,'daily_watch','2099-01-11','claude','ok')", [runId]);
      const finding = `INSERT INTO research_findings (run_id,finding_key,symbol,company_name,kind,polarity,claim,event_date,confidence,lead,evidence,verification_status,verified_at,dedupe_key)
        VALUES ($1,$2,$3,'Calendar co','clinical','neutral',$4,$5,'high',false,'[]'::jsonb,$6,$7,$8)`;
      await client.query(finding, [runId, "f1", "CCAL2", "Readout expected in February", "2099-02-01", "verified", "2099-01-11T10:00:00Z", "d1"]);
      await client.query(finding, [runId, "f2", "CCAL2", "Unverified date", "2099-02-02", "quote_not_found", "2099-01-11T10:00:00Z", "d2"]);
      await client.query(finding, [runId, "f3", "CCAL2", "Past event", "2099-01-01", "verified", "2099-01-11T10:00:00Z", "d3"]);

      await client.query("INSERT INTO portfolio_baseline (as_of,source,cash_eur,positions) VALUES ('2099-01-01','manual',0,$1::jsonb)",
        [JSON.stringify([{ symbol: "CCAL1", quantity: 3, valueEur: 120 }])]);
      await client.query(`INSERT INTO research_candidates (symbol,company_name,state,state_since,review_at) VALUES ('CCAL2','Calendar two','START_READY','2099-01-10','2099-01-17')`);

      const view = await readCatalystCalendar(client, "2099-01-11", { symbols: ["CCAL1", "CCAL2", "CCAL3"] });
      expect(view.latestPull).toBe("2099-01-11");
      expect(view.next.map((e) => [e.ticker, e.reportDate, e.timeOfDay, e.stale, e.previousReportDate])).toEqual([
        ["CCAL2", "2099-01-12", null, true, null],
        ["CCAL1", "2099-01-14", "pre-market", false, "2099-01-20"],
        ["CCAL3", "2099-01-15", "post-market", true, null],
      ]);
      expect(view.events.filter((e) => e.type === "research")).toEqual([expect.objectContaining({ symbol: "CCAL2", date: "2099-02-01", kind: "clinical", confirmed: false })]);
      expect(view.preEarnings).toEqual([
        { symbol: "CCAL2", reason: "start_ready", reportDate: "2099-01-12", timeOfDay: null, daysUntil: 1, stale: true },
        { symbol: "CCAL1", reason: "held", reportDate: "2099-01-14", timeOfDay: "pre-market", daysUntil: 3, stale: false },
      ]);
    } finally {
      try { await client.query("ROLLBACK"); } finally { await client.end(); }
    }
  });
});
