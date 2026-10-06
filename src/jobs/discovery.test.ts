import { readFileSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { edgarCandidates, frameCandidates, managerHoldingChanges, moverCandidates, ownershipCandidates, parse13fHoldings, rankCandidates, reviewCandidate, saveCandidates, saveDiscoveryPriceBars, screenCandidates, themeCandidates, weekStart, type DiscoveryCandidate } from "./discovery";
import { loadUniverse } from "../db/universe";

const filingFeed = readFileSync(join(process.cwd(), "src/collectors/sources/fixtures/sec_getcurrent_8k.xml"), "utf8");

describe("weekly discovery", () => {
  it("filters current 8-Ks to Items 1.01 and 2.02 using submissions, with filing links", async () => {
    const get = async (url: string) => {
      if (url.includes("getcurrent")) return filingFeed;
      if (url.includes("CIK0001045810")) return JSON.stringify({ filings: { recent: { accessionNumber: ["0001045810-26-000099"], items: ["2.02,9.01"] } } });
      if (url.includes("CIK0009100099")) return JSON.stringify({ filings: { recent: { accessionNumber: ["0000000000-26-000001"], items: ["5.02"] } } });
      if (url.includes("company_tickers")) return JSON.stringify({ "0": { cik_str: 1045810, ticker: "NVDA" }, "1": { cik_str: 9100099, ticker: "ZZZZ" } });
      throw new Error(url);
    };
    const rows = await edgarCandidates(get);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "NVDA", score: 4, sources: [{ kind: "edgar", detail: "8-K Item 2.02" }] });
    expect(rows[0].sources[0].url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\//);
  });

  it("pages past the first 100 filings before checking 8-K item numbers", async () => {
    const entry = (cik: number, accession: string, date: string) => `<entry><title>8-K - ${cik === 2 ? "Growth Systems" : "Filler Inc"} (${String(cik).padStart(10, "0")}) (Filer)</title><link href="https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replaceAll("-", "")}/${accession}-index.htm"/><summary>Filed: ${date}</summary><updated>${date}T12:00:00Z</updated><id>urn:tag:sec.gov,2008:accession-number=${accession}</id></entry>`;
    const ids = Array.from({ length: 100 }, (_, i) => `0000000000-26-${String(i + 1).padStart(6, "0")}`);
    const late = "0000000000-26-000101";
    const feed = (body: string) => `<feed>${body}</feed>`;
    const get = async (url: string) => {
      if (url.includes("start=0&")) return feed(ids.map((id) => entry(1, id, "2026-10-05")).join(""));
      if (url.includes("start=100&")) return feed(entry(2, late, "2026-10-04"));
      if (url.includes("CIK0000000001")) return JSON.stringify({ filings: { recent: { accessionNumber: ids, items: ids.map(() => "5.02") } } });
      if (url.includes("CIK0000000002")) return JSON.stringify({ filings: { recent: { accessionNumber: [late], items: ["1.01"] } } });
      if (url.includes("company_tickers")) return JSON.stringify({ a: { cik_str: 1, ticker: "FILL" }, b: { cik_str: 2, ticker: "GROW" } });
      throw new Error(url);
    };
    expect((await edgarCandidates(get, "2026-10-01")).map((row) => row.symbol)).toEqual(["GROW"]);
  });

  it("takes current 13D and 13G issuer changes from both feeds", async () => {
    const d = readFileSync(join(process.cwd(), "src/collectors/sources/fixtures/sec_getcurrent_13d.xml"), "utf8");
    const g = readFileSync(join(process.cwd(), "src/collectors/sources/fixtures/sec_getcurrent_13g.xml"), "utf8");
    const rows = await ownershipCandidates(async (url) => url.includes("company_tickers")
      ? JSON.stringify({ a: { cik_str: 1321655, ticker: "PLTR" }, b: { cik_str: 1045810, ticker: "NVDA" } })
      : url.includes("13D") ? d : g, "2026-10-01");
    expect(rows.map((row) => row.symbol)).toContain("PLTR");
    expect(rows.map((row) => row.symbol)).toContain("NVDA");
    expect(rows.every((row) => row.sources[0].url.startsWith("https://www.sec.gov/"))).toBe(true);
  });

  it("combines beneficiary-chain evidence, excludes tracked names, and caps the shortlist", () => {
    const pcvx = themeCandidates().find((row) => row.symbol === "PCVX")!;
    expect(pcvx.sources[0].detail).toContain("Clinical readout");
    const ranked = rankCandidates([pcvx, { ...pcvx, score: 5, sources: [{ kind: "edgar", url: "https://www.sec.gov/x", detail: "8-K Item 1.01" }] }, ...themeCandidates()], new Set(["NVDA"]), 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].symbol).toBe("PCVX");
    expect(ranked[0].sources).toHaveLength(3);
    expect(weekStart("2026-10-06")).toBe("2026-10-05");
  });

  it("uses the SEC frame growth screen across names outside the universe", () => {
    const rows = frameCandidates([
      { ticker: "NEW", name: "New Corp", yoyPercent: 45, priorYoyPercent: 15, accelerationPp: 30, revenue: 90_000_000 },
      { ticker: "SMALL", name: "Small Corp", yoyPercent: 90, priorYoyPercent: 10, accelerationPp: 80, revenue: 10_000_000 },
    ], "https://data.sec.gov/api/xbrl/frames/us-gaap/Revenues/USD/CY2026Q2.json");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "NEW", growth: { current: 45, prior: 15 }, sources: [{ kind: "frames" }] });
  });

  it("reads 13F information table changes as quarter-end signals", () => {
    const current = parse13fHoldings(`<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable"><infoTable><nameOfIssuer>Growth Systems Inc</nameOfIssuer><cusip>123456789</cusip><shrsOrPrnAmt><sshPrnamt>150</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable></informationTable>`);
    const prior = [{ ...current[0], shares: 50 }];
    expect(current).toEqual([{ cusip: "123456789", name: "Growth Systems Inc", shares: 150 }]);
    expect(managerHoldingChanges(current, prior, new Map([["GROWTH SYSTEMS", "NEW"]]), "Manager", "https://www.sec.gov/x")[0].sources[0].detail).toContain("quarter-end");
    expect(managerHoldingChanges(current, [{ ...current[0], shares: 120 }], new Map([["GROWTH SYSTEMS", "NEW"]]), "Manager", "https://www.sec.gov/x")).toEqual([]);
  });

  it("applies the ordinary score and exclusions before ranking", async () => {
    const bars = Array.from({ length: 220 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: i % 2 ? 100 : 200 }));
    const row = frameCandidates([{ ticker: "NEW", name: "New Corp", yoyPercent: 40, priorYoyPercent: 20, accelerationPp: 20, revenue: 90_000_000 }], "https://data.sec.gov/x")[0];
    const screened = await screenCandidates([row], "2026-08-08", async () => bars, { growthSectorRotation: true, dataTailwind: true }, 500);
    expect(screened).toHaveLength(1);
    expect(screened[0].ruleScore).toBeGreaterThanOrEqual(12);
    expect(screened[0]).toMatchObject({ signalDate: "2026-08-08", benchmarkClose: 500 });
    expect(await screenCandidates([{ ...row, growth: { current: -10, prior: 20 } }], "2026-08-08", async () => bars, { growthSectorRotation: true, dataTailwind: true }, 500)).toEqual([]);
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("promotes a reviewed name outside the original universe into the same runtime universe", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const dir = mkdtempSync(join(tmpdir(), "discovery-test-"));
    const gate = join(dir, "gate.json");
    const symbol = "F7ZZ";
    const week = "2099-06-01";
    const candidate: DiscoveryCandidate = { symbol, name: "F7 Test", sector: "Biotech", theme: "Biotech catalysts", score: 2, ruleScore: 14, ruleState: "Wait", signalDate: "2099-05-31", benchmarkClose: 123,
      sources: [{ kind: "theme", url: "https://www.sec.gov/", detail: "test chain" }] };
    try {
      expect((await loadUniverse(pool)).some((row) => row.symbol === symbol)).toBe(false);
      expect(await saveCandidates(pool, week, [candidate], 1)).toHaveLength(1);
      expect(await saveCandidates(pool, week, [{ ...candidate, symbol: "F7ZY" }], 1)).toHaveLength(0);
      await reviewCandidate(pool, symbol, true, gate);
      expect((await loadUniverse(pool)).find((row) => row.symbol === symbol)).toMatchObject({ name: "F7 Test", sector: "Biotech" });
      expect(JSON.parse(readFileSync(gate, "utf8")).symbols).toEqual([symbol]);
      unlinkSync(gate);
      await reviewCandidate(pool, symbol, true, gate);
      expect(JSON.parse(readFileSync(gate, "utf8")).symbols).toEqual([symbol]);
      expect((await pool.query("SELECT status FROM discovery_candidates WHERE week_start=$1 AND symbol=$2", [week, symbol])).rows[0].status).toBe("approved");
    } finally {
      await pool.query("DELETE FROM discovery_candidates WHERE week_start=$1", [week]);
      await pool.query("DELETE FROM instruments WHERE ticker=$1", [symbol]);
      await pool.end();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("finds a genuine outside-universe mover from stored discovery prices", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const date = "2099-05-26";
    const bars = Array.from({ length: 26 }, (_, i) => ({ date: `2099-05-${String(i + 1).padStart(2, "0")}`,
      open: i === 25 ? 120 : 100, high: i === 25 ? 121 : 101, low: i === 25 ? 119 : 99,
      close: i === 25 ? 120 : 100, volume: i === 25 ? 3000 : 1000 }));
    try {
      await pool.query("BEGIN");
      await saveDiscoveryPriceBars(pool, { symbol: "F7MV", name: "Mover", sector: "Growth" }, bars);
      expect((await pool.query("SELECT 1 FROM instruments WHERE ticker='F7MV'")).rowCount).toBe(0);
      const movers = await moverCandidates(pool, date);
      expect(movers.find((row) => row.symbol === "F7MV")).toMatchObject({ name: "Mover", sources: [{ kind: "price_volume" }] });
    } finally { await pool.query("ROLLBACK"); await pool.end(); }
  });
});
