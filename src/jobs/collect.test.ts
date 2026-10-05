import { documentRetentionDays } from "../db/collectors";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectEdgar, parseForm4 } from "../collectors/edgar";
import { collectFred } from "../collectors/fred";
import { getText, resetSecLimiter, secSlot, RateLimitLockout } from "../collectors/http";
import { parseRss } from "../collectors/rss";
import { MemoryCollectorRepository } from "../db/collectors";
import { deriveFacts, runCollect } from "./collect";

const dir = join(process.cwd(), "src/collectors/fixtures");
const fixture = (name: string) => readFile(join(dir, name), "utf8");
const get = (url: string) => getText(url, { fixtureDir: dir });

describe("collectors", () => {
  it("parses the 8-K exhibit and open-market Form 4 transactions", async () => {
    const docs = await collectEdgar("NVDA", 1045810, "2026-09-01", get);
    expect(docs.map((doc) => doc.docType)).toEqual(["8-K", "8-K EX-99.1", "4"]);
    expect(docs[0].body).toContain("Item 2.02");
    expect(docs[1].body).toContain("Fixture revenue increased");
    expect(docs[1].body).not.toContain("<html>");
    const trades = parseForm4(await fixture("nvda_form4.xml"));
    expect(trades.map((trade) => trade.code)).toEqual(["P", "S"]);
    expect(trades.reduce((sum, trade) => sum + (trade.code === "P" ? trade.shares : -trade.shares), 0)).toBe(60);
  });

  it("finds Item 2.02 in the primary 8-K when submissions omits items", async () => {
    const fallbackGet = async (url: string) => {
      if (url.includes("submissions/CIK0001045810.json")) {
        const submission = JSON.parse(await fixture("nvda_submissions.json"));
        delete submission.filings.recent.items;
        return JSON.stringify(submission);
      }
      return get(url);
    };
    const docs = await collectEdgar("NVDA", 1045810, "2026-09-01", fallbackGet);
    expect(docs.map((doc) => doc.docType)).toEqual(["8-K", "8-K EX-99.1", "4"]);
    expect(docs[1].body).toContain("Fixture revenue increased");
  });

  it("stores EX-99.1 even when the filing has no Item 2.02 tag", async () => {
    const untaggedGet = async (url: string) => {
      if (url.includes("submissions/CIK0001045810.json")) {
        const submission = JSON.parse(await fixture("nvda_submissions.json"));
        submission.filings.recent.items[0] = "9.01";
        return JSON.stringify(submission);
      }
      return get(url);
    };
    const docs = await collectEdgar("NVDA", 1045810, "2026-09-01", untaggedGet);
    expect(docs.map((doc) => doc.docType)).toEqual(["8-K", "8-K EX-99.1", "4"]);
    expect(docs[1].body).toContain("Fixture revenue increased");
  });

  it("stores foreign issuer forms without unsupported insider or earnings facts", async () => {
    const repo = new MemoryCollectorRepository();
    const result = await runCollect(repo, ["ASML"], { since: "2026-09-01", sources: ["edgar"], get, now: () => new Date("2026-10-05T12:00:00Z") });
    expect(result.exitCode).toBe(0);
    expect([...repo.documents.values()].map((doc) => doc.docType)).toEqual(["6-K", "20-F"]);
    expect([...repo.facts.values()]).toEqual([]);
  });

  it("keeps stored filings through their evidence windows", () => {
    for (const type of ["8-K", "10-Q", "10-K", "20-F", "6-K", "8-K EX-99.1"]) expect(documentRetentionDays(type)).toBe(100);
    expect(documentRetentionDays("4")).toBe(60);
    expect(documentRetentionDays("13F holdings summary")).toBe(60);
    expect(documentRetentionDays("press release")).toBe(30);
  });

  it("matches the RSS item and is idempotent on re-run", async () => {
    const parsed = parseRss(await fixture("globenewswire.xml"), [{ symbol: "NVDA", name: "NVIDIA" }], "2026-09-01");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].meta.title).toBe("NVIDIA announces fixture update");
    const repo = new MemoryCollectorRepository();
    const options = { since: "2026-09-01", sources: ["edgar", "rss"], get, now: () => new Date("2026-10-05T12:00:00Z") };
    const first = await runCollect(repo, ["NVDA"], options);
    const second = await runCollect(repo, ["NVDA"], options);
    expect(first.documentsWritten).toBe(4);
    expect(second.documentsWritten).toBe(0);
    expect(second.factsWritten).toBe(0);
    expect([...repo.facts.values()].find((fact) => fact.key === "insider_net_buy_90d")?.value).toEqual({ netShares: 60, netDollars: 520 });
  });

  it("does not match common ticker words in unrelated RSS text", () => {
    const xml = `<rss><channel><item><title>Net results now available</title><link>https://example.test/release</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate><description>Sea conditions and a block of text.</description></item></channel></rss>`;
    expect(parseRss(xml, [{ symbol: "NET", name: "Cloudflare" }, { symbol: "NOW", name: "ServiceNow" }, { symbol: "SE", name: "Sea" }, { symbol: "SQ", name: "Block" }], "2026-09-01")).toEqual([]);
    const market = xml.replace("Net results", "NASDAQ: NET results");
    expect(parseRss(market, [{ symbol: "NET", name: "Cloudflare" }], "2026-09-01")).toHaveLength(1);
  });

  it("strips and bounds RSS summaries before storing metadata", () => {
    const xml = `<rss><channel><item><title>NVIDIA update</title><link>https://example.test/release</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>NVIDIA ${"x".repeat(30000)}</p>]]></description></item></channel></rss>`;
    const [doc] = parseRss(xml, [{ symbol: "NVDA", name: "NVIDIA" }], "2026-09-01");
    expect(doc.meta.summary).not.toContain("<p>");
    expect(Buffer.byteLength(doc.meta.summary as string)).toBeLessThanOrEqual(16384);
  });

  it("computes price metrics only with enough stored bars", async () => {
    const repo = new MemoryCollectorRepository();
    repo.bars = async () => Array.from({ length: 21 }, (_, i) => ({ date: `2026-09-${String(30 - i).padStart(2, "0")}`, close: i === 0 ? 110 : 100, volume: i === 0 ? 200 : 100 }));
    const facts = await deriveFacts("NVDA", [], new Map(), repo, "2026-10-05");
    expect((facts.find((fact) => fact.key === "price_move_5d")?.value as { percent: number }).percent).toBeCloseTo(10);
    expect(facts.find((fact) => fact.key === "volume_ratio_20d")?.value).toEqual({ ratio: 2 });
    expect(facts.find((fact) => fact.key === "price_move_5d")?.asOf).toBe("2026-09-30");
  });

  it("writes nothing in dry-run mode", async () => {
    const repo = new MemoryCollectorRepository();
    const result = await runCollect(repo, ["NVDA"], { since: "2026-09-01", get, dryRun: true, now: () => new Date("2026-10-05T12:00:00Z") });
    expect(result.documentsParsed).toBe(4);
    expect(repo.documents.size).toBe(0);
    expect(repo.facts.size).toBe(0);
    expect(repo.runs).toHaveLength(0);
  });

  it("stores a FRED observation without keeping the API key in its URL", async () => {
    const doc = await collectFred("fixture-key", async () => JSON.stringify({ observations: [{ date: "2026-09-01", value: "4.25" }] }));
    expect(doc.symbol).toBeNull();
    expect(doc.url).toBe("https://fred.stlouisfed.org/series/FEDFUNDS");
    expect(JSON.stringify(doc)).not.toContain("fixture-key");
  });

  it("keeps SEC requests at or below five per second", async () => {
    resetSecLimiter();
    let now = 1000;
    const started: number[] = [];
    for (let i = 0; i < 6; i++) {
      await secSlot(() => now, async (ms) => { now += ms; });
      started.push(now);
    }
    expect(started).toEqual([1000, 1250, 1500, 1750, 2000, 2250]);
  });

  it("rejects non-HTTPS redirects and stops after repeated 429s", async () => {
    const redirect = async () => new Response("", { status: 302, headers: { location: "http://example.test/file" } });
    await expect(getText("https://www.globenewswire.com/rssfeed", { fetcher: redirect })).rejects.toThrow("Insecure redirect");
    const limited = async () => new Response("", { status: 429 });
    await expect(getText("https://www.globenewswire.com/rssfeed", { fetcher: limited, wait: async () => {} })).rejects.toBeInstanceOf(RateLimitLockout);
  });

  it("stops the run on the first rate-limit lockout", async () => {
    const calls: string[] = [];
    const lockedGet = async (url: string) => {
      calls.push(url);
      if (url.includes("submissions/")) throw new RateLimitLockout("HTTP 429");
      return get(url);
    };
    const result = await runCollect(new MemoryCollectorRepository(), ["NVDA", "AMD"], {
      sources: ["edgar"], get: lockedGet, now: () => new Date("2026-10-05T12:00:00Z"),
    });
    expect(result.exitCode).toBe(1);
    expect(result.failures).toEqual([{ ticker: "NVDA", reason: "HTTP 429" }, { ticker: "AMD", reason: "not fetched: rate-limit lockout" }]);
    expect(calls.filter((url) => url.includes("submissions/"))).toHaveLength(1);
  });

  it("uses the existing SQ to XYZ mapping for EDGAR CIK lookup", async () => {
    const mappedGet = async (url: string) => url.endsWith("company_tickers.json")
      ? JSON.stringify({ "0": { ticker: "XYZ", cik_str: 123 } }) : fixture("empty_submissions.json");
    const result = await runCollect(new MemoryCollectorRepository(), ["SQ"], {
      sources: ["edgar"], get: mappedGet, now: () => new Date("2026-10-05T12:00:00Z"),
    });
    expect(result.exitCode).toBe(0);
    expect(result.succeeded).toBe(1);
  });
});

import { earningsExhibitNames } from "../collectors/edgar";
describe("earningsExhibitNames", () => {
  const names = ["0001045810-26-000073-index.html", "nvda-20260826.htm", "nvda-20260826.xsd", "q2fy27cfocommentary.htm", "q2fy27pr.htm", "R1.htm", "FilingSummary.xml"];
  it("finds freely named exhibits on an Item 2.02 filing", () => {
    expect(earningsExhibitNames(names, "nvda-20260826.htm", "2.02,9.01")).toEqual(["q2fy27cfocommentary.htm", "q2fy27pr.htm"]);
  });
  it("returns nothing without Item 2.02", () => { expect(earningsExhibitNames(names, "nvda-20260826.htm", "5.02")).toEqual([]); });
});
