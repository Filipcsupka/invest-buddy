import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { DatabaseUniverseProvider } from "../data/db-provider";
import { reviewDueSymbols } from "./extraction-runs";
import { insiderEvents } from "./insiders";
import { isKnownInstrument, loadUniverse, scoredMember } from "./universe";

/** Membership rows: a core name, a collect-only name and the benchmark. */
const members = [{ ticker: "CORE", list: "core" }, { ticker: "NEWX", list: "extended" }, { ticker: "SPY", list: "benchmark" }];

/** Fake pool: returns the members whichever list filter the SQL states. A query with no list filter returns all of them. */
function fake(): { db: pg.Pool; seen: string[] } {
  const seen: string[] = [];
  const db = { query: async (sql: string) => {
    seen.push(sql);
    const hidden = sql.includes("NOT IN ('benchmark', 'extended')") ? ["benchmark", "extended"] : sql.includes("<> 'benchmark'") ? ["benchmark"] : [];
    const kept = members.filter((m) => !hidden.includes(m.list));
    return { rows: kept.map((m) => ({ ticker: m.ticker, name: m.ticker, sector: "S", tier: null, source: "guide" })), rowCount: kept.length };
  } } as unknown as pg.Pool;
  return { db, seen };
}
const tickers = (rows: { ticker?: string; symbol?: string }[]) => rows.map((r) => r.ticker ?? r.symbol);

describe("collect-only list (extended)", () => {
  it("scoredMember excludes benchmark and extended", () => {
    expect(scoredMember()).toBe("m.list NOT IN ('benchmark', 'extended')");
    expect(scoredMember("x")).toBe("x.list NOT IN ('benchmark', 'extended')");
  });

  it("loadUniverse hides the extended name by default and returns it for collectors", async () => {
    expect(tickers(await loadUniverse(fake().db))).toEqual(["CORE"]);
    expect(tickers(await loadUniverse(fake().db, undefined, { collect: true }))).toEqual(["CORE", "NEWX"]);
  });

  it("known-instrument checks (extract result post, bundle ingest) carry the gate", async () => {
    const { db, seen } = fake();
    await isKnownInstrument(db, "NEWX");
    expect(seen[0]).toContain("list NOT IN ('benchmark', 'extended')");
    expect(readFileSync("src/app/api/ingest/bundle/[symbol]/route.ts", "utf8")).toContain("list NOT IN ('benchmark', 'extended')");
  });

  it("scoring selection (DatabaseUniverseProvider) never returns an extended name", async () => {
    const { db } = fake();
    expect(tickers(await new DatabaseUniverseProvider(db, "2026-10-18").instruments())).toEqual(["CORE"]);
  });

  it("AI selection (extract review queue) never returns an extended name", async () => {
    const { db } = fake();
    expect(await reviewDueSymbols(db, 30, 10)).toEqual(["CORE"]);
  });

  it("the insiders page query carries the gate", async () => {
    const { db, seen } = fake();
    await insiderEvents("NEWX", db);
    expect(seen[0]).toContain("NOT IN ('benchmark', 'extended')");
  });
});

/** Guard: every SQL that decides what is scored, shown or sent to a model uses the gate. Only these files may filter on benchmark alone. */
const BENCHMARK_ONLY_ALLOWED = new Set(["src/db/universe.ts", "src/jobs/discovery.ts", "src/universe/candidates.ts", "src/collectors/sources/alphavantage-calendar.test.ts"]);
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === "node_modules" ? [] : walk(path)) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("collect-only guard", () => {
  it("no file outside the allow-list filters membership on benchmark alone", () => {
    const offenders = walk("src").filter((f) => !f.endsWith("collect-only.test.ts") && !BENCHMARK_ONLY_ALLOWED.has(f) && /list\s*<>\s*'benchmark'/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("collectors load the collect universe, gate and AI inputs do not", () => {
    const collectors = ["prices", "collect", "watch", "companyfacts", "earnings-calendar", "thirteenf"];
    for (const job of collectors) expect(readFileSync(`src/jobs/${job}.ts`, "utf8"), job).toMatch(/loadUniverse\([^)]*collect: true/);
    for (const file of ["src/jobs/detect.ts", "src/app/api/ingest/universe/route.ts", "src/jobs/macro.ts"]) expect(readFileSync(file, "utf8"), file).not.toMatch(/collect: true/);
  });
});
