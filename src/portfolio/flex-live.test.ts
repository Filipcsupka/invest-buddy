import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MemoryPortfolioRepository } from "../db/portfolio";
import { postBaseline, runPortfolio } from "../jobs/portfolio";
import { toEurPortfolio } from "./eur";
import { parseFlexStatement } from "./flex";
import { lastTradingDay, normalizeFlex, parseFlexPortfolio } from "./model";

const fixture = new URL("./fixtures/flex-live.xml", import.meta.url);
const provider = { bars: async () => [
  { date: "2026-09-01", open: 1, high: 1, low: 1, close: 100, volume: 1 },
  { date: "2026-09-30", open: 1, high: 1, low: 1, close: 104, volume: 1 },
] };

describe("live Flex shape", () => {
  it("converts positions and cash to EUR with the latest rate and skips what it cannot convert", async () => {
    const eur = parseFlexPortfolio(await readFile(fixture, "utf8"));
    expect(eur.asOf).toBe("2026-09-30");
    expect(eur.positions).toEqual([
      { symbol: "AAAA", quantity: 10, valueEur: 990, costEur: 810 },
      { symbol: "BBBB", quantity: 20, valueEur: 3000, costEur: 2800 },
    ]);
    expect(eur.cashEur).toBe(1495);
    expect(eur.nav).toEqual({ start: 50000, end: 52000, deposits: 1000 });
    expect(eur.warnings).toMatchObject({ skippedPositions: 1, cashSource: "sum" });
  });

  it("uses the base summary when a cash currency has no rate, and fails when there is no cash at all", async () => {
    const raw = parseFlexStatement(await readFile(fixture, "utf8"));
    raw.rates = [];
    expect(toEurPortfolio({ ...raw, rates: [{ reportDate: "20260930", fromCurrency: "EUR", toCurrency: "EUR", rate: "1" }] }).warnings.cashSource).toBe("base-summary");
    expect(() => toEurPortfolio({ ...raw, cash: [] })).toThrow("cash missing");
    expect(() => toEurPortfolio({ ...raw, cash: raw.cash.filter((row) => row.currency !== "BASE_SUMMARY"), rates: [] })).toThrow("cash missing");
  });

  it("defaults the report date to the last trading day", async () => {
    const xml = (await readFile(fixture, "utf8")).replace(/ toDate="\d+"/, "");
    expect(parseFlexPortfolio(xml, "2026-10-04").asOf).toBe("2026-10-02");
    expect(lastTradingDay("2026-10-06")).toBe("2026-10-06");
  });

  it("publishes weights and percentages only", async () => {
    const snapshot = await normalizeFlex(await readFile(fixture, "utf8"), provider);
    expect(snapshot.weights).toEqual([{ symbol: "AAAA", weightPercent: 24.81 }, { symbol: "BBBB", weightPercent: 75.19 }]);
    expect(snapshot.series).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE-ACCOUNT|52000|50000|1495|990|3000|CCCC|cash/i);
  });
});

describe("portfolio job baseline post", () => {
  const target = (calls: { url: string; init?: RequestInit }[], stored: unknown, postStatus = 200) => ({
    baseUrl: "http://web.test:3000/", token: "TOKEN",
    fetcher: async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init?.method) return Response.json({ baseline: stored }, { status: stored === "down" ? 503 : 200 });
      return Response.json({ recorded: true }, { status: postStatus });
    },
  });

  it("posts a flex baseline and keeps the stored monthly contribution", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const result = await postBaseline(await readFile(fixture, "utf8"), target(calls, { monthlyContributionEur: 300 }));
    expect(result).toEqual({ status: "posted", positions: 2, skipped: 1 });
    expect(calls[0].url).toBe("http://web.test:3000/api/ingest/portfolio-baseline?asOf=2026-09-30");
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      asOf: "2026-09-30", source: "flex", currency: "EUR", cashEur: 1495, monthlyContributionEur: 300,
      positions: [{ symbol: "AAAA", quantity: 10, valueEur: 990, costEur: 810 }, { symbol: "BBBB", quantity: 20, valueEur: 3000, costEur: 2800 }],
    });
  });

  it("sends null when nothing is stored and skips the post when the stored value cannot be read", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    await postBaseline(await readFile(fixture, "utf8"), target(calls, null));
    expect(JSON.parse(String(calls[1].init?.body)).monthlyContributionEur).toBeNull();
    const down: { url: string; init?: RequestInit }[] = [];
    expect((await postBaseline(await readFile(fixture, "utf8"), target(down, "down"))).status).toBe("skipped");
    expect(down).toHaveLength(1);
  });

  it("logs counts and statuses only and keeps the previous snapshot when the fetch fails", async () => {
    const lines: string[] = [];
    const repository = new MemoryPortfolioRepository();
    const xml = await readFile(fixture, "utf8");
    process.env.FLEX_TOKEN = "T"; process.env.FLEX_QUERY_ID = "Q";
    const original = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response(xml)) as typeof fetch;
      const calls: { url: string; init?: RequestInit }[] = [];
      await runPortfolio(repository, 1, target(calls, null), (line) => lines.push(line)).catch(() => {});
      globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
      await expect(runPortfolio(repository, 1, target(calls, null), (line) => lines.push(line))).rejects.toThrow();
    } finally { globalThis.fetch = original; delete process.env.FLEX_TOKEN; delete process.env.FLEX_QUERY_ID; }
    expect(lines.join("\n")).toMatch(/baseline posted positions=2 skippedPositions=1/);
    expect(lines.join("\n")).not.toMatch(/PRIVATE-ACCOUNT|AAAA|BBBB|TOKEN|990|1495/);
  });
});
