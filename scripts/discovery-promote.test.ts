import { describe, expect, it } from "vitest";
import { nextSteps, parsePromoteArgs, promoteCandidate } from "./discovery-promote";

/** In-memory stand-in for the tables the promotion touches. Each branch matches one real query. */
function fakeDb(candidateStatus = "pending") {
  const state = {
    candidates: [{ week_start: "2026-10-05", symbol: "GRWT", name: "Growth Technologies Inc", sector: "Growth", status: candidateStatus }],
    instruments: [] as { ticker: string; name: string; sector: string; tier: number | null; source: string }[],
    membership: [] as { ticker: string; list: string; tier: number | null; reason: string; criteria: string; actor: string; from: string }[],
    ids: [] as Record<string, unknown>[],
  };
  const query = async (sql: string, params: unknown[] = []) => {
    const t = sql.replace(/\s+/g, " ").trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(t) || t.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
    if (t.startsWith("SELECT week_start::text,name,sector,status FROM discovery_candidates")) {
      const rows = state.candidates.filter((c) => c.symbol === params[0] && ["pending", "approved"].includes(c.status));
      return { rows, rowCount: rows.length };
    }
    if (t.startsWith("SELECT 1 FROM universe_membership")) { const rows = state.membership.filter((m) => m.ticker === params[0] && m.list !== "benchmark"); return { rows, rowCount: rows.length }; }
    if (t.startsWith("SELECT id,valid_from::text FROM universe_membership")) return { rows: [], rowCount: 0 };
    if (t.startsWith("SELECT valid_to::text FROM universe_membership")) return { rows: [], rowCount: 0 };
    if (t.startsWith("INSERT INTO instruments")) {
      const [ticker, name, sector, tier, source] = params as [string, string, string, number | null, string];
      state.instruments.push({ ticker, name, sector, tier, source });
      return { rows: [], rowCount: 1 };
    }
    if (t.startsWith("INSERT INTO universe_membership")) {
      const [ticker, list, tier, from, reason, criteria, actor] = params as [string, string, number | null, string, string, string, string];
      state.membership.push({ ticker, list, tier, reason, criteria, actor, from });
      return { rows: [], rowCount: 1 };
    }
    if (t.startsWith("INSERT INTO instrument_ids")) {
      if (!state.ids.some((r) => r.ticker === params[0])) state.ids.push({ id: state.ids.length + 1, ticker: params[0], instrument_type: "equity", cik: null, sic: null, sic_description: null, fiscal_year_end: null, state_of_incorporation: null, exchange: null, vendor_symbols: {} });
      return { rows: [], rowCount: 1 };
    }
    if (t.startsWith("SELECT id, ticker, instrument_type, cik")) return { rows: state.ids, rowCount: state.ids.length };
    if (t.startsWith("UPDATE instrument_ids SET")) {
      const columns = /SET (.+) WHERE id = \$1/.exec(t)![1].split(", ").map((part) => part.split(" = ")[0]);
      const row = state.ids.find((r) => r.id === params[0])!;
      columns.forEach((column, i) => { row[column] = params[i + 1]; });
      return { rows: [], rowCount: 1 };
    }
    if (t.startsWith("UPDATE discovery_candidates SET status='approved'")) {
      for (const c of state.candidates) if (c.symbol === params[1] && c.week_start === params[0] && c.status === "pending") c.status = "approved";
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${t.slice(0, 90)}`);
  };
  const db = { query, connect: async () => ({ query, release: () => {} }) };
  return { state, db: db as never };
}

const get = async (url: string) => {
  if (url.endsWith("company_tickers.json")) return JSON.stringify({ "0": { ticker: "GRWT", cik_str: 4 } });
  if (url.includes("CIK0000000004")) return JSON.stringify({ sic: "7372", sicDescription: "Services-Prepackaged Software", fiscalYearEnd: "1231", stateOfIncorporation: "DE", exchanges: ["Nasdaq"] });
  throw new Error(`unexpected ${url}`);
};
const opts = { dryRun: false, today: "2026-10-12", get };

describe("parsePromoteArgs", () => {
  it("takes one symbol and an optional --dry-run", () => {
    expect(parsePromoteArgs(["grwt"])).toEqual({ symbol: "GRWT", dryRun: false });
    expect(parsePromoteArgs(["GRWT", "--dry-run"])).toEqual({ symbol: "GRWT", dryRun: true });
    expect(parsePromoteArgs(["--dry-run", "BRK.B"])).toEqual({ symbol: "BRK.B", dryRun: true });
  });
  it("rejects a missing or invalid symbol and unknown flags", () => {
    expect(() => parsePromoteArgs([])).toThrow("Usage");
    expect(() => parsePromoteArgs(["--dry-run"])).toThrow("Usage");
    expect(() => parsePromoteArgs(["GRWT", "OTHER"])).toThrow("Usage");
    expect(() => parsePromoteArgs(["GRWT", "--force"])).toThrow("Usage");
    expect(() => parsePromoteArgs(["1BAD"])).toThrow("Usage");
  });
});

describe("promoteCandidate", () => {
  it("refuses a symbol with no pending or approved candidate row", async () => {
    const { db, state } = fakeDb();
    await expect(promoteCandidate(db, "ZZZZ", opts)).rejects.toThrow("Unknown candidate ZZZZ");
    expect(state.membership).toHaveLength(0);
    const rejected = fakeDb("rejected");
    await expect(promoteCandidate(rejected.db, "GRWT", opts)).rejects.toThrow("Unknown candidate GRWT");
  });

  it("writes nothing on a dry run", async () => {
    const { db, state } = fakeDb();
    const result = await promoteCandidate(db, "GRWT", { ...opts, dryRun: true });
    expect(result).toMatchObject({ symbol: "GRWT", week: "2026-10-05", dryRun: true, addedToUniverse: true, seeded: [] });
    expect(state.membership).toHaveLength(0);
    expect(state.instruments).toHaveLength(0);
    expect(state.ids).toHaveLength(0);
    expect(state.candidates[0].status).toBe("pending");
    expect(nextSteps(result)[0]).toContain("Dry run");
  });

  it("adds the ticker to the discovery list, seeds CIK and SIC, and approves the candidate", async () => {
    const { db, state } = fakeDb();
    const result = await promoteCandidate(db, "GRWT", opts);
    expect(state.instruments).toEqual([{ ticker: "GRWT", name: "Growth Technologies Inc", sector: "Growth", tier: null, source: "discovery" }]);
    expect(state.membership).toEqual([{ ticker: "GRWT", list: "discovery", tier: null, from: "2026-10-12", reason: "Approved discovery candidate, week 2026-10-05", criteria: "discovery-v1", actor: "discovery-promote" }]);
    expect(state.ids[0]).toMatchObject({ ticker: "GRWT", cik: 4, sic: "7372", sic_description: "Services-Prepackaged Software", fiscal_year_end: "1231", exchange: "Nasdaq" });
    expect(state.candidates[0].status).toBe("approved");
    expect(result).toMatchObject({ addedToUniverse: true, seedFailures: [] });
    expect(result.seeded).toContain("sic=7372");
    expect(nextSteps(result).join("\n")).toContain("unextractedDiscoverySymbols");
  });

  it("is safe to run again: no second membership row and the status stays approved", async () => {
    const { db, state } = fakeDb();
    await promoteCandidate(db, "GRWT", opts);
    const again = await promoteCandidate(db, "GRWT", opts);
    expect(again.addedToUniverse).toBe(false);
    expect(state.membership).toHaveLength(1);
    expect(state.ids).toHaveLength(1);
    expect(state.candidates[0].status).toBe("approved");
  });

  it("reports a failed SEC read, still promotes, and points to master:refresh", async () => {
    const { db, state } = fakeDb();
    const result = await promoteCandidate(db, "GRWT", { ...opts, get: async () => { throw new Error("SEC down"); } });
    expect(state.membership).toHaveLength(1);
    expect(state.candidates[0].status).toBe("approved");
    expect(result.seedFailures).toHaveLength(1);
    expect(nextSteps(result)[0]).toContain("npm run master:refresh");
  });
});
