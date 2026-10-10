import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type pg from "pg";
import { expect, it } from "vitest";
import { reviewCandidate } from "./discovery";
import { gateSymbols, unextractedDiscoverySymbols } from "./detect";
import { runCollect } from "./collect";
import { MemoryCollectorRepository } from "../db/collectors";
import { loadUniverse, isKnownInstrument } from "../db/universe";
import { DatabaseUniverseProvider } from "../data/db-provider";
import universeFile from "../../scanner/universe.json";

/** Minimal in-memory stand-in for the four tables the discovery path touches. Each branch matches one real query. */
function fakeDb() {
  const instruments = [{ ticker: "NVDA", name: "NVIDIA", sector: "AI & semiconductors", tier: 1, source: "guide" }, { ticker: "SPY", name: "SPY", sector: "Benchmark", tier: null, source: "benchmark" }] as { ticker: string; name: string; sector: string; tier: number | null; source: string }[];
  const candidates = [{ week_start: "2026-10-05", symbol: "MU", name: "Micron Technology", sector: "AI & semiconductors", status: "pending" }];
  const extractionRuns: { symbol: string; status: string; applied_at: Date | null }[] = [];
  const consensus: { symbol: string; as_of: string }[] = [];
  const membership = [{ ticker: "NVDA", list: "core" }, { ticker: "SPY", list: "benchmark" }];
  const query = async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, " ");
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock)/.test(text)) return { rows: [], rowCount: 0 };
    if (text.includes("FROM discovery_candidates")) { const rows = candidates.filter((c) => c.symbol === params[0] && ["pending", "approved"].includes(c.status)); return { rows, rowCount: rows.length }; }
    if (text.startsWith("INSERT INTO instruments")) {
      const [ticker, name, sector] = params as string[]; const old = instruments.find((i) => i.ticker === ticker);
      if (old) Object.assign(old, { name, sector }); else instruments.push({ ticker, name, sector, tier: null, source: "discovery" });
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("INSERT INTO universe_membership")) {
      const ticker = params[0] as string;
      if (!membership.some((m) => m.ticker === ticker)) membership.push({ ticker, list: "discovery" });
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE discovery_candidates")) { candidates.find((c) => c.symbol === params[2])!.status = params[0] as string; return { rows: [], rowCount: 1 }; }
    if (text.includes("FROM universe_membership m") && text.includes("JOIN instruments i")) return { rows: instruments.filter((i) => membership.some((m) => m.ticker === i.ticker && m.list !== "benchmark")).sort((a, b) => a.ticker.localeCompare(b.ticker)), rowCount: 0 };
    if (text.startsWith("SELECT 1 FROM universe_membership")) { const rows = membership.filter((m) => m.ticker === params[0] && m.list !== "benchmark"); return { rows, rowCount: rows.length }; }
    if (text.includes("m.list='discovery'") && text.includes("FROM extraction_runs")) return { rows: instruments.filter((i) => membership.some((m) => m.ticker === i.ticker && m.list === "discovery") && !extractionRuns.some((e) => e.symbol === i.ticker && e.status === "ok" && e.applied_at)).map((i) => ({ symbol: i.ticker })), rowCount: 0 };
    if (text.includes("JOIN consensus_findings c ON c.symbol=i.ticker")) return { rows: instruments.filter((i) => consensus.some((c) => c.symbol === i.ticker)), rowCount: 0 };
    throw new Error(`unexpected query: ${text.slice(0, 80)}`);
  };
  const db = { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool;
  return { db, instruments, candidates, extractionRuns, consensus };
}

it("an approved discovery candidate outside universe.json reaches every stage from the instruments table", async () => {
  const { db, candidates, extractionRuns, consensus } = fakeDb();
  const dir = mkdtempSync(join(tmpdir(), "discovery-path-"));
  const symbol = "MU", file = join(dir, "gate.json");
  try {
    expect((universeFile.instruments as { symbol: string }[]).some((i) => i.symbol === symbol)).toBe(false);
    expect(await isKnownInstrument(db, symbol)).toBe(false);

    // approve -> instruments (source discovery) and the --output symbols file
    await reviewCandidate(db, symbol, true, file);
    expect(candidates[0].status).toBe("approved");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ symbols: [symbol], reasons: { [symbol]: ["approved discovery candidate"] } });
    const universe = await loadUniverse(db);
    expect(universe).toContainEqual({ symbol, name: "Micron Technology", sector: "AI & semiconductors", tier: null });
    expect(await isKnownInstrument(db, symbol)).toBe(true);

    // detect: pending until first applied extraction, then enters the gate with a reason
    const pending = await unextractedDiscoverySymbols(db);
    expect(pending).toEqual([symbol]);
    const gate = gateSymbols({ today: "2026-10-09", filings: [], insiders: [], drawdowns: [], valuations: [], newSymbols: pending }, universe.map((u) => u.symbol));
    expect(gate.symbols).toEqual([symbol]);

    // collect: the table-derived company list resolves the CIK and stores without "No EDGAR CIK"
    const get = async (url: string) => {
      if (url.includes("company_tickers")) return JSON.stringify({ 0: { ticker: "MU", cik_str: 723125 } });
      if (url.includes("submissions/CIK0000723125")) return JSON.stringify({ filings: { recent: { accessionNumber: [], form: [], filingDate: [], primaryDocument: [], items: [] } } });
      throw new Error(`unexpected ${url}`);
    };
    const result = await runCollect(new MemoryCollectorRepository(), [symbol], { sources: ["edgar"], get, companies: universe, now: () => new Date("2026-10-09T12:00:00Z") });
    expect(result).toMatchObject({ requested: 1, succeeded: 1, failures: [], exitCode: 0 });

    // extract: after an applied run the name leaves the pending list; reconcile writes consensus; daily scoring then reads it
    expect(await new DatabaseUniverseProvider(db, "2026-10-09", false).instruments()).toEqual([]);
    extractionRuns.push({ symbol, status: "ok", applied_at: new Date() });
    consensus.push({ symbol, as_of: "2026-10-09" });
    expect(await unextractedDiscoverySymbols(db)).toEqual([]);
    expect((await new DatabaseUniverseProvider(db, "2026-10-09", false).instruments()).map((i) => i.ticker)).toEqual([symbol]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
