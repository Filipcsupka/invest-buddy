import { expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readRecord, worstOutcomes } from "./track-record";
import { ideasPostSchema, recordJudge } from "./ideas";

it.skipIf(!process.env.TEST_DATABASE_URL)("reads stored real returns and keeps snapshots immutable", async () => {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  const ticker = `TR${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  try {
    await client.query("BEGIN");
    const baseline = await readRecord(client as never, "2026-02-02");
    await client.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ($1,'Track test','Test','guide')", [ticker]);
    for (const [symbol, date, close] of [[ticker, "2026-01-02", 100], [ticker, "2026-02-02", 110], ["SPY", "2026-01-02", 200], ["SPY", "2026-02-02", 210]] as const) {
      await client.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume) VALUES ($1,$2,$3,$3,$3,$3,1)
        ON CONFLICT (ticker,bar_date) DO NOTHING`, [symbol, date, close]);
    }
    await client.query("INSERT INTO record_snapshots (ticker,as_of,score,state,rule_hits,rules_version,reference_close) VALUES ($1,'2026-01-02',20,'Setup met (>=18)','[]','test-v1',100)", [ticker]);
    await client.query("INSERT INTO record_signals (ticker,as_of,source,event_key,tier,state,score,rules_version,reference_close,spy_reference_close) VALUES ($1,'2026-01-02','score','score-a','SETUP','Setup met (>=18)',20,'test-v1',100,200)", [ticker]);
    await client.query("INSERT INTO record_signals (ticker,as_of,source,event_key,tier,state,score,rules_version,reference_close,spy_reference_close) VALUES ($1,'2026-01-02','judge','judge-a','STARTER','START_POSITION',20,'test-v1',NULL,NULL)", [ticker]);
    const record = await readRecord(client as never, "2026-02-02");
    const signal = record.signals.find((item) => item.ticker === ticker);
    expect(signal?.windows[1]?.stock).toBeCloseTo(0.1);
    expect(signal?.windows[1]?.excess).toBeCloseTo(0.05);
    expect(signal?.windows[5]).toBeNull();
    expect(record.snapshotCount).toBeGreaterThan(0);
    expect(record.buySignalCount).toBe(baseline.buySignalCount + 1);
    expect(record.hit20).toEqual(baseline.hit20);
    await client.query("SAVEPOINT immutable_check");
    await expect(client.query("UPDATE record_snapshots SET score=19 WHERE ticker=$1", [ticker])).rejects.toThrow(/immutable/);
    await client.query("ROLLBACK TO SAVEPOINT immutable_check");
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});

it.skipIf(!process.env.TEST_DATABASE_URL)("retains every same-day judge run as a separate immutable event", async () => {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const ticker = `TR${randomBytes(4).toString("hex").toUpperCase()}`;
  const asOf = "2026-01-02";
  const idea = { symbol: ticker, action: "ADD", sizeTier: "ADD_THIRD", amountMinEur: 0, amountMaxEur: 0,
    verdict: "test", whatHappened: ["a", "b"], whyItMatters: ["c"], setup: { company: "Strong", entry: "Good", catalyst: "Neutral" },
    numbers: [{ label: "a", value: "1" }, { label: "b", value: "2" }, { label: "c", value: "3" }],
    plan: { amountNow: "none", trigger: "t", invalidation: "i", opportunityCost: "o" }, evidence: [], unconfirmed: false,
    signature: "ADD|Strong|Good|Neutral|ADD_THIRD", ruleConfigVersion: "test" };
  try {
    await pool.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ($1,'Track test','Test','guide')", [ticker]);
    await pool.query("INSERT INTO record_snapshots (ticker,as_of,score,state,rule_hits) VALUES ($1,$2,20,'Setup met (>=18)','[]')", [ticker, asOf]);
    const hashes = Array.from({ length: 3 }, () => randomBytes(32).toString("hex"));
    const runIds = Array.from({ length: 3 }, () => randomUUID());
    for (const [index, inputHash] of hashes.entries()) {
      const changed = index === 1 ? { ...idea, action: "START_POSITION", sizeTier: "STANDARD", signature: "START_POSITION|Strong|Good|Neutral|STANDARD" } : idea;
      const body = ideasPostSchema.parse({ run: { asOf, runId: runIds[index], agent: "claude", model: "test", inputHash, status: "ok" }, ideas: [changed] });
      expect((await recordJudge(pool, body)).stored).toBe(1);
    }
    const events = await pool.query<{ event_key: string; tier: string; state: string }>(
      "SELECT event_key,tier,state FROM record_signals WHERE ticker=$1 AND as_of=$2 AND source='judge' ORDER BY id", [ticker, asOf]);
    expect(events.rows).toEqual([
      { event_key: runIds[0], tier: "ADD_THIRD", state: "ADD" },
      { event_key: runIds[1], tier: "STANDARD", state: "START_POSITION" },
      { event_key: runIds[2], tier: "ADD_THIRD", state: "ADD" },
    ]);
    const changed = { ...idea, action: "START_POSITION", sizeTier: "STANDARD", signature: "START_POSITION|Strong|Good|Neutral|STANDARD" };
    const forced = randomUUID();
    expect((await recordJudge(pool, ideasPostSchema.parse({ run: { asOf, runId: forced, agent: "claude", model: "test", inputHash: hashes[2], status: "ok" }, ideas: [changed] }))).stored).toBe(0);
    expect((await pool.query<{ event_key: string }>("SELECT event_key FROM record_signals WHERE ticker=$1 AND source='judge' ORDER BY id DESC LIMIT 1", [ticker])).rows[0]?.event_key).toBe(forced);
    expect((await pool.query("SELECT 1 FROM record_signals WHERE ticker=$1 AND source='judge'", [ticker])).rowCount).toBe(4);
    expect((await recordJudge(pool, ideasPostSchema.parse({ run: { asOf, runId: forced, agent: "claude", model: "test", inputHash: hashes[2], status: "ok" }, ideas: [changed] }))).stored).toBe(0);
    expect((await pool.query("SELECT 1 FROM record_signals WHERE ticker=$1 AND source='judge'", [ticker])).rowCount).toBe(4);
  } finally { await pool.end(); }
});

it("worstOutcomes keeps the worst window per signal and one row per ticker and date", () => {
  const win = (excess: number) => ({ date: "2026-02-01", stock: excess, spy: 0, excess });
  const sig = (id: number, ticker: string, asOf: string, windows: Record<number, ReturnType<typeof win> | null>) =>
    ({ id, ticker, asOf, source: "score" as const, tier: "SETUP", state: "s", score: 20, windows: { 1: null, 5: null, 20: null, 60: null, ...windows } });
  const out = worstOutcomes([
    sig(1, "AAA", "2026-01-02", { 1: win(-0.05), 20: win(-0.2) }),
    sig(2, "AAA", "2026-01-02", { 1: win(-0.1) }),
    sig(3, "BBB", "2026-01-02", { 5: win(0.1) }),
    sig(4, "CCC", "2026-01-02", { 1: win(-0.3), 5: win(-0.01) }),
  ] as never);
  expect(out.map((o) => [o.id, o.window, o.excess])).toEqual([[4, 1, -0.3], [1, 20, -0.2]]);
});
