import { documentRetentionDays } from "../db/collectors";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectEdgar, foreignFilerStatus, parseForm4, parseForm4Transactions } from "../collectors/edgar";
import { collectFred } from "../collectors/fred";
import { getText, resetSecLimiter, secSlot, RateLimitLockout } from "../collectors/http";
import { parseRss } from "../collectors/rss";
import { MemoryCollectorRepository } from "../db/collectors";
import { shapeSymbol } from "../db/judge-input";
import { deriveFacts, guardCollectUserAgent, runCollect } from "./collect";

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

  it("stores P, S, M and derivative rows with owner and plan status", async () => {
    const xml = `<ownershipDocument><aff10b5One>1</aff10b5One><reportingOwner><reportingOwnerId><rptOwnerCik>123</rptOwnerCik><rptOwnerName>Example Owner</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>0</isOfficer></reportingOwnerRelationship></reportingOwner><nonDerivativeTable>${["P", "S", "M"].map((code) => `<nonDerivativeTransaction><transactionDate><value>2026-10-02</value></transactionDate><transactionCoding><transactionCode>${code}</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>10</value></transactionShares><transactionPricePerShare><value>2</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>100</value></sharesOwnedFollowingTransaction></postTransactionAmounts></nonDerivativeTransaction>`).join("")}</nonDerivativeTable><derivativeTable><derivativeTransaction><transactionDate><value>2026-10-02</value></transactionDate><transactionCoding><transactionCode>M</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>5</value></transactionShares></transactionAmounts></derivativeTransaction></derivativeTable></ownershipDocument>`;
    const rows = parseForm4Transactions(xml);
    expect(rows.map((row) => [row.code, row.derivative])).toEqual([["P", false], ["S", false], ["M", false], ["M", true]]);
    expect(rows[0]).toMatchObject({ ownerCik: "123", ownerName: "Example Owner", isDirector: true, isOfficer: false, price: 2, sharesAfter: 100, plan10b5: "yes" });
    const joint = parseForm4Transactions(xml.replace("</reportingOwner>", "</reportingOwner><reportingOwner><reportingOwnerId><rptOwnerCik>456</rptOwnerCik><rptOwnerName>Second Owner</rptOwnerName></reportingOwnerId></reportingOwner>"));
    expect(joint[0].ownerCik).toBeNull();
    expect(joint[0].reportingOwners.map((owner) => owner.cik)).toEqual(["123", "456"]);
    expect(parseForm4Transactions(await fixture("nvda_form4.xml"))[0].plan10b5).toBe("unknown");
    expect(parseForm4Transactions(xml.replace("<value>10</value>", "<footnoteId id=\"F1\"/>"))).toHaveLength(3);
    const repo = new MemoryCollectorRepository();
    await runCollect(repo, ["NVDA"], { since: "2026-09-01", sources: ["edgar"], get, now: () => new Date("2026-10-05T12:00:00Z") });
    expect(repo.insiderTransactions.size).toBe(4);
    await runCollect(repo, ["NVDA"], { since: "2026-09-01", sources: ["edgar"], get, now: () => new Date("2026-10-05T12:00:00Z") });
    expect(repo.insiderTransactions.size).toBe(4);
    expect([...repo.facts.values()].find((fact) => fact.key === "insider_net_buy_90d")?.value).toEqual({ netShares: 60, netDollars: 520 });
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
    const facts = [...repo.facts.values()];
    expect(facts.map((fact) => [fact.key, fact.asOf])).toEqual([["sec_filer_status", "2026-10-01"]]);
    expect(facts[0].value).toMatchObject({ kind: "foreign_private_issuer", forms: ["20-F", "6-K"] });
    expect((facts[0].value as { unknown: { field: string }[] }).unknown.map((u) => u.field)).toEqual(["revenueAccelerating", "revenueDeclining", "earnings_8k", "insider_net_buy_90d"]);
    expect(facts[0].expiresAt).toBe("2027-01-09T00:00:00.000Z");
  });

  it("treats a 20-F filer that also files Form 4 (SE) as foreign and keeps insider data", () => {
    const status = foreignFilerStatus([{ docType: "20-F", publishedAt: "2026-04-17T00:00:00Z" }, { docType: "6-K", publishedAt: "2026-08-25T00:00:00Z" }, { docType: "4", publishedAt: "2026-10-09T00:00:00Z" }]);
    expect(status?.asOf).toBe("2026-08-25");
    expect(status?.value.unknown.map((u) => u.field)).toEqual(["revenueAccelerating", "revenueDeclining", "earnings_8k"]);
  });

  it("does not mark domestic filers (MELI files 10-K, 10-Q and 8-K) or an empty list as foreign", () => {
    expect(foreignFilerStatus([{ docType: "10-Q", publishedAt: "2026-08-01T00:00:00Z" }, { docType: "8-K", publishedAt: "2026-08-02T00:00:00Z" }, { docType: "4", publishedAt: "2026-08-03T00:00:00Z" }])).toBeNull();
    expect(foreignFilerStatus([{ docType: "10-K", publishedAt: "2026-02-01T00:00:00Z" }, { docType: "6-K", publishedAt: "2026-08-02T00:00:00Z" }])).toBeNull();
    expect(foreignFilerStatus([])).toBeNull();
  });

  it("keeps collecting SEC documents when the press release feed times out", async () => {
    const repo = new MemoryCollectorRepository();
    const flaky = ((url: string) => url.includes("globenewswire") ? Promise.reject(new Error("The operation was aborted due to timeout")) : get(url)) as typeof get;
    const result = await runCollect(repo, ["NVDA"], { since: "2026-09-01", sources: ["edgar", "rss"], get: flaky, now: () => new Date("2026-10-05T12:00:00Z") });
    expect(result.succeeded).toBe(1);
    expect(result.stoppedReason).toBeNull();
    expect(result.failures).toEqual([{ ticker: "rss", reason: "globenewswire: The operation was aborted due to timeout" }]);
    expect(result.exitCode).toBe(0);
    expect([...repo.documents.values()].some((doc) => doc.source === "edgar")).toBe(true);
  });

  it("marks edgar documents display_allowed and rss documents not, so only edgar reaches judge input", async () => {
    const repo = new MemoryCollectorRepository();
    await runCollect(repo, ["NVDA"], { since: "2026-09-01", sources: ["edgar", "rss"], get, now: () => new Date("2026-10-05T12:00:00Z") });
    const stored = [...repo.documents.values()];
    const edgar = stored.filter((doc) => doc.source === "edgar"), rss = stored.filter((doc) => doc.source === "rss");
    expect(edgar.length).toBeGreaterThan(0);
    expect(rss.length).toBeGreaterThan(0);
    for (const doc of edgar) expect(doc.meta).toMatchObject({ display_allowed: true, license_note: expect.stringContaining("SEC") });
    for (const doc of rss) expect(doc.meta.display_allowed).toBe(false);
    // The judge input and the ideas page keep a url only when meta->>'display_allowed' = 'true'.
    const cleared = new Set(stored.filter((doc) => String(doc.meta.display_allowed) === "true").map((doc) => doc.url));
    const row = { ticker: "NVDA", name: "NVDA", sector: "AI", tier: 1, audit: { ticker: "NVDA", asOf: "2026-10-05", technical: 8, fundamentals: 7, macro: 3, total: 18, state: "Watch", pullbackInUptrend: false, invalidReasons: [], inputs: { bars: [] }, ruleHits: [] } } as never;
    const finding = { symbol: "NVDA", field: "epsBeat", value: true, agreement: "agree", verified: true, reason: "r", carried_from: null, evidence_refs: stored.map((doc) => ({ url: doc.url, publishedAt: "2026-10-01", quote: "q" })) } as never;
    const symbol = shapeSymbol(row, [finding], null, 0, null, cleared);
    expect(symbol.evidence.map((e) => e.url).sort()).toEqual(edgar.map((doc) => doc.url).sort());
  });

  it("keeps stored filings through their evidence windows", () => {
    for (const type of ["8-K", "10-Q", "10-K", "20-F", "6-K", "8-K EX-99.1"]) expect(documentRetentionDays(type)).toBe(100);
    expect(documentRetentionDays("4")).toBe(400);
    expect(documentRetentionDays("13F holdings summary")).toBe(60);
    expect(documentRetentionDays("press release")).toBe(90);
  });

  it("matches the RSS item and is idempotent on re-run", async () => {
    const parsed = parseRss(await fixture("globenewswire.xml"), [{ symbol: "NVDA", name: "NVIDIA" }], "2026-09-01");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].meta.title).toBe("NVIDIA announces fixture update");
    const repo = new MemoryCollectorRepository();
    const options = { since: "2026-09-01", sources: ["edgar", "rss"], get, now: () => new Date("2026-10-05T12:00:00Z") };
    const first = await runCollect(repo, ["NVDA"], options);
    const second = await runCollect(repo, ["NVDA"], options);
    expect(first.documentsWritten).toBe(5);
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
    expect(result.documentsParsed).toBe(5);
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

describe("collect SEC_USER_AGENT guard", () => {
  const real = { SEC_USER_AGENT: "Porgy ops@example.com" };
  it("refuses a missing or placeholder contact for the default run and for SEC sources", () => {
    for (const env of [{}, { SEC_USER_AGENT: "Porgy REPLACE_WITH_CONTACT_EMAIL" }, { SEC_USER_AGENT: "Porgy" }]) {
      expect(() => guardCollectUserAgent(undefined, env)).toThrow(/SEC_USER_AGENT/);
      for (const source of ["edgar", "frames", "getcurrent", "13f"]) expect(() => guardCollectUserAgent(["rss", source], env)).toThrow(/SEC_USER_AGENT/);
    }
  });
  it("accepts a real contact, and does not ask for one on sources that never call SEC", () => {
    expect(() => guardCollectUserAgent(undefined, real)).not.toThrow();
    expect(() => guardCollectUserAgent(["rss", "fred", "gnews"], {})).not.toThrow();
  });
});
