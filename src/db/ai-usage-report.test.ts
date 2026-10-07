import { expect, it } from "vitest";
import { summarizeUsage, summarizeSamples, usageReport, recordUsageSample } from "./ai-usage-report";
import pg from "pg";

it("counts a rolling five-hour peak, UTC periods, cutoffs, and calls by job and model", () => {
  const row = (at: string, tokens: number, extra = {}) => ({ created_at: new Date(at), completed_at: new Date(at), kind: "extract", agent: "claude", model: "haiku", status: "ok", cutoff_window: null, reset_at: null, reset_hint: null, input_tokens: tokens, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, used_tokens: tokens, ...extra });
  const report = summarizeUsage([
    row("2026-10-04T23:00:00Z", 10),
    row("2026-10-05T01:00:00Z", 20),
    row("2026-10-05T06:01:00Z", 5),
    row("2026-10-05T07:00:00Z", 0, { kind: "judge", model: "sonnet", status: "cutoff", cutoff_window: "5h", reset_at: new Date("2026-10-05T10:00:00Z") }),
  ]);
  expect(report.rolling5hPeak).toEqual({ tokens: 30, endedAt: "2026-10-05T01:00:00.000Z" });
  expect(report.tokensPerDayUtc).toEqual({ "2026-10-04": 10, "2026-10-05": 25 });
  expect(report.tokensPerIsoWeekUtc).toEqual({ "2026-W40": 10, "2026-W41": 25 });
  expect(report.callsByJobAndModel).toEqual({ "extract/haiku": 3, "judge/sonnet": 1 });
  expect(report.cutoffCount).toBe(1);
  expect(report.cutoffs[0]).toMatchObject({ window: "5h", resetAt: "2026-10-05T10:00:00.000Z" });
});

it("does not mistake a reservation for measured tokens", () => {
  const at = new Date("2026-10-05T01:00:00Z");
  const row = { created_at: at, completed_at: at, kind: "judge", agent: "claude", model: "sonnet", status: "cutoff", cutoff_window: "5h", reset_at: null, reset_hint: null, input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_creation_tokens: null, used_tokens: 20000 };
  expect(summarizeUsage([row]).rolling5hPeak.tokens).toBe(0);
});

it("shows live window peaks and per-run deltas", () => {
  const row = (phase: string, at: string, five: string, week: string) => ({ run_id: "run", job: "extract", phase, observed_at: new Date(at), five_hour_pct: five, seven_day_pct: week, five_hour_reset_at: null, seven_day_reset_at: null });
  const report = summarizeSamples([row("start", "2026-10-07T01:50:00Z", "20", "30"), row("end", "2026-10-07T06:30:00Z", "42", "33")]);
  expect(report).toMatchObject({ fiveHourPeakPct: 42, sevenDayPeakPct: 33, runs: [{ fiveHourAccountDeltaPct: 22, sevenDayAccountDeltaPct: 3, samples: 2 }] });
});

it.skipIf(!process.env.TEST_DATABASE_URL)("reads the migrated quota ledger without exposing request data", async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO ai_budget_calls (id,month,kind,agent,auth_source,model,reserved_tokens,reserved_usd,used_tokens,used_usd,created_at,completed_at,status,cutoff_window,reset_at,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens)
      VALUES ('00000000-0000-4000-8000-000000000020',date_trunc('month',now())::date,'judge','claude','subscription','test-model',100,1,30,0,now(),now(),'cutoff','5h',now()+interval '2 hours',10,5,12,3)`);
    const report = await usageReport(client);
    expect(report.callsByJobAndModel["judge/test-model"]).toBe(1);
    expect(report.cutoffs.some((event) => event.model === "test-model" && event.window === "5h")).toBe(true);
    expect(report.rolling5hPeak.tokens).toBeGreaterThanOrEqual(30);
    await recordUsageSample(client, { job: "judge", runId: "00000000-0000-4000-8000-000000000020", phase: "start", fiveHourPct: 11, sevenDayPct: 21, fiveHourResetAt: null, sevenDayResetAt: null });
    expect((await usageReport(client)).liveUsage.fiveHourPeakPct).toBeGreaterThanOrEqual(11);
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});
