import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { runResearchNotify } from "./research-notify";

const oldMode = process.env.TELEGRAM_CARD_MODE;
const oldChat = process.env.TELEGRAM_OWNER_CHAT_ID;
afterEach(() => {
  if (oldMode === undefined) delete process.env.TELEGRAM_CARD_MODE; else process.env.TELEGRAM_CARD_MODE = oldMode;
  if (oldChat === undefined) delete process.env.TELEGRAM_OWNER_CHAT_ID; else process.env.TELEGRAM_OWNER_CHAT_ID = oldChat;
});

describe("research notification", () => {
  it("never queries or sends in public mode", async () => {
    delete process.env.TELEGRAM_CARD_MODE;
    const db = { query: () => { throw new Error("public job queried private data"); } } as unknown as pg.Pool;
    const texts: string[] = [];
    expect(await runResearchNotify(db, { locale: "en", notifier: { send: async t => { texts.push(t); } }, target: "public" })).toEqual({ sent: 0, suppressed: 0 });
    expect(texts).toEqual([]);
  });

  it("sends a Monday owner summary with idle cash and no allocation amount", async () => {
    process.env.TELEGRAM_CARD_MODE = "owner";
    process.env.TELEGRAM_OWNER_CHAT_ID = "private";
    const db = { query: async (sql: string) => {
      if (sql.includes("FROM research_candidates ORDER BY symbol") || sql.includes("FROM trade_ideas")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM portfolio_baseline")) return { rows: [{ as_of: "2026-10-12", source: "manual", cash_eur: "1000", monthly_contribution_eur: "100", positions: [] }], rowCount: 1 };
      if (sql.includes("INSERT INTO notification_deliveries")) return { rows: [{}], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    } } as unknown as pg.Pool;
    const texts: string[] = [];
    expect((await runResearchNotify(db, { locale: "en", notifier: { send: async t => { texts.push(t); } }, target: "private", now: new Date("2026-10-12T12:00:00Z") })).sent).toBe(1);
    expect(texts[0]).toContain("Unallocated cash: EUR 1000");
    expect(texts[0]).toContain("no amount pending an approved rule");
  });

  it("claims the fingerprint before sending and posts nothing on a rerun", async () => {
    process.env.TELEGRAM_CARD_MODE = "owner";
    process.env.TELEGRAM_OWNER_CHAT_ID = "private";
    let lastAlert: object | null = null;
    let lastAt: string | null = null;
    const claims = new Set<string>();
    const db = { query: async (sql: string, params?: unknown[]) => {
      const result = (rows: object[], rowCount = rows.length) => ({ rows, rowCount });
      if (sql.includes("FROM research_candidates ORDER BY symbol")) return result([{ symbol: "SMPL", state: "WATCH", state_since: "2026-10-07", review_at: "2026-11-07",
        promotion_status: "none", scorable: true, upgrade_triggers: [], invalidation: [], last_alert: lastAlert, last_alert_at: lastAt }]);
      if (sql.includes("FROM trade_ideas")) return result([]);
      if (sql.includes("FROM portfolio_baseline")) return result([]);
      if (sql.includes("FROM research_events") && sql.includes("kind IN ('discovered'")) return result(lastAt ? [] : [{ kind: "state_change", at: "2026-10-10T00:00:00Z", to_state: "WATCH" }]);
      if (sql.includes("FROM research_events") && sql.includes("kind IN ('discovered','state_change')")) return result([{ at: "2026-10-10T00:00:00Z", to_state: "WATCH" }]);
      if (sql.includes("FROM research_findings")) return result([{ finding_key: "f1", dedupe_key: "known", kind: "contract", verification_status: "verified", confirmed: true,
        source_class: "primary", evidence: [
          { url: "https://example.test/failed", sourceName: "Failed", verify: { status: "fetch_failed", sourceClass: "press" } },
          { url: "https://example.test/ir", sourceName: "IR", verify: { status: "verified", sourceClass: "primary" } },
        ], claim: "A contract was signed", figures: [] }]);
      if (sql.includes("FROM score_results") || sql.includes("FROM daily_bars")) return result([]);
      if (sql.includes("FROM research_runs")) return result([{ id: "run-id", model_output: { candidates: [{ symbol: "SMPL", card: {
        verdict: "Contract signed", whatHappened: [{ text: "A contract was signed", findingIds: ["f1"] }], whyItMatters: [], opportunityCost: null } }] } }]);
      if (sql.includes("INSERT INTO notification_deliveries")) { const key = JSON.stringify(params); if (claims.has(key)) return result([], 0); claims.add(key); return result([{}]); }
      if (sql.includes("UPDATE research_candidates SET last_alert")) { lastAlert = JSON.parse(params![1] as string) as object; lastAt = params![2] as string; return result([]); }
      if (sql.includes("INSERT INTO research_events")) return result([]);
      throw new Error(`Unexpected query: ${sql}`);
    } } as unknown as pg.Pool;
    const texts: string[] = [];
    const input = { locale: "en" as const, notifier: { send: async (t: string) => { texts.push(t); } }, target: "private", now: new Date("2026-10-11T12:00:00Z") };
    expect((await runResearchNotify(db, input)).sent).toBe(1);
    expect((await runResearchNotify(db, input)).sent).toBe(0);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("https://example.test/ir");
    expect(texts[0]).not.toContain("https://example.test/failed");
    // P7: owner context; the unread tables leave the catalyst empty and the macro list falls back to the static calendar.
    expect(texts[0]).toContain("Next macro event: FOMC decision 2026-10-28");
    expect(texts[0]).not.toContain("Next catalyst");
  });
});
