import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { collectEdgar, filingRows, filingUrl, parseForm4 } from "../collectors/edgar";
import { ALLOWED_HOSTS, MAX_RESPONSE_BYTES, RateLimitLockout, getText, resetSecLimiter } from "../collectors/http";
import { plainText, document } from "../collectors/types";
import { MemoryCollectorRepository, PostgresCollectorRepository, documentRetentionDays } from "../db/collectors";
import { windowDaysFor } from "../db/bundle";
import { freshnessDays } from "../data/evidence";
import { collectExitCode, deriveFacts, runCollect, safeReason } from "./collect";

const dir = join(process.cwd(), "src/collectors/fixtures");
const fixture = (name: string) => readFileSync(join(dir, name), "utf8");
const deploy = readFileSync(join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base/collector-cronjobs.yaml"), "utf8");
const cronjob = (name: string) => deploy.split(/^---$/m).find((doc) => doc.includes(`name: ${name}`)) ?? "";
const noWait = async () => {};
const secEnv = () => vi.stubEnv("SEC_USER_AGENT", "InvestBuddy test test@example.invalid");

describe("M1 daily facts do not flag every ticker", () => {
  it("keeps the earnings fact on one row per filing, not one per run date", async () => {
    const repo = new MemoryCollectorRepository();
    const get = (url: string) => getText(url, { fixtureDir: dir });
    for (const day of ["2026-10-05", "2026-10-06", "2026-10-07"]) {
      await runCollect(repo, ["NVDA"], { since: "2026-09-01", sources: ["edgar"], get, now: () => new Date(`${day}T12:00:00Z`) });
    }
    const earnings = [...repo.facts.values()].filter((fact) => fact.key === "latest_earnings_8k");
    expect(earnings).toHaveLength(1);
    expect(earnings[0].asOf).toBe("2026-10-01");
  });
});

describe("M2 Form 4 XSL primaryDocument", () => {
  it("fetches the raw XML, not the XSL-rendered HTML view", async () => {
    const requested: string[] = [];
    const get = async (url: string) => {
      requested.push(url);
      if (url.includes("submissions/")) return fixture("nvda_submissions_xsl.json");
      if (url.endsWith("/000104581026000002/ownership.xml")) return fixture("nvda_form4.xml");
      throw new Error(`HTML view requested: ${url}`);
    };
    const [doc] = await collectEdgar("NVDA", 1045810, "2026-09-01", get);
    expect(doc.url).toBe("https://www.sec.gov/Archives/edgar/data/1045810/000104581026000002/ownership.xml");
    expect((doc.meta.trades as unknown[]).length).toBe(2);
  });
});

describe("M3 Form 4 trade without a price", () => {
  const xml = fixture("nvda_form4_unpriced.xml");
  it("marks missing or footnoted prices as null dollars, never 0", () => {
    expect(parseForm4(xml).map((trade) => [trade.code, trade.shares, trade.dollars])).toEqual([["P", 100, 1000], ["S", 50, null], ["S", 30, null]]);
  });
  it("sums only priced trades and flags netDollars as incomplete", async () => {
    const doc = document({ source: "edgar", symbol: "NVDA", docType: "4", url: "https://www.sec.gov/a.xml", publishedAt: "2026-10-02T00:00:00Z", body: "x", meta: { trades: parseForm4(xml) } });
    const facts = await deriveFacts("NVDA", [doc], new Map([[doc.url, 1]]), new MemoryCollectorRepository(), "2026-10-05");
    expect(facts.find((fact) => fact.key === "insider_net_buy_90d")?.value).toEqual({ netShares: 20, netDollars: 1000, dollarsComplete: false });
  });
});

describe("M4 document evidence windows", () => {
  it("keeps SEC filings for their evidence windows", () => {
    expect(documentRetentionDays("4")).toBe(400);
    expect(documentRetentionDays("8-K EX-99.1")).toBe(100);
  });
  it("takes the retention days from freshnessDays and never drops a document before the bundle stops serving it", () => {
    expect(documentRetentionDays("10-Q")).toBe(Math.max(freshnessDays.revenueAccelerating, freshnessDays.epsBeat, freshnessDays.guidanceRaised));
    expect(documentRetentionDays("4")).toBe(Math.max(400, freshnessDays.insiderOrInstitutionalBuying));
    expect(documentRetentionDays("rss")).toBe(Math.max(freshnessDays.productCatalyst, freshnessDays.narrativeChanged));
    for (const docType of ["8-K", "8-K EX-99.1", "10-Q", "10-K", "20-F", "6-K", "4", "13F-HR", "rss", "gdelt", "XBRL revenue frame"]) {
      expect(documentRetentionDays(docType), docType).toBeGreaterThanOrEqual(windowDaysFor(docType));
    }
  });
  it("refreshes expiry on unchanged refetch without counting a content write", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const pool = { query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: sql.startsWith("SELECT") ? [{ content_hash: "h" }] : [{ id: "1" }], rowCount: 1 };
    } };
    const repo = new PostgresCollectorRepository(pool as never);
    const base = { source: "edgar", symbol: "NVDA", url: "https://www.sec.gov/x", publishedAt: "2026-10-02T00:00:00Z", body: "b", meta: {}, contentHash: "h" };
    expect(await repo.upsertDocument({ ...base, docType: "4" })).toEqual({ id: 1, written: false });
    expect(await repo.upsertDocument({ ...base, docType: "10-K" })).toEqual({ id: 1, written: false });
    expect(calls[1].params.at(-1)).toBe(400);
    expect(calls[3].params.at(-1)).toBe(100);
    expect(calls[1].sql).toContain("expires_at=EXCLUDED.expires_at");
    expect(calls[1].sql).not.toContain("WHERE source_documents.content_hash");
  });
});

describe("M5 lockout is a failed run and is not retried", () => {
  it("exits 1 when the lockout hits one of the last tickers", async () => {
    const symbols = Array.from({ length: 12 }, (_, i) => `T${i}`);
    const tickers = Object.fromEntries(symbols.map((ticker, i) => [String(i), { ticker, cik_str: 1000 + i }]));
    const get = async (url: string) => {
      if (url.endsWith("company_tickers.json")) return JSON.stringify(tickers);
      if (url.includes("CIK0000001011.json")) throw new RateLimitLockout("HTTP 429");
      return fixture("empty_submissions.json");
    };
    const result = await runCollect(new MemoryCollectorRepository(), symbols, { sources: ["edgar"], get, now: () => new Date("2026-10-05T12:00:00Z") });
    expect(result.failures).toHaveLength(1);
    expect(result.stoppedReason).toBe("HTTP 429");
    expect(result.exitCode).toBe(1);
  });
  it("combines stop reason and failure ratio", () => {
    expect(collectExitCode("HTTP 429", 1, 35)).toBe(1);
    expect(collectExitCode(null, 1, 35)).toBe(0);
    expect(collectExitCode(null, 4, 35)).toBe(1);
  });
  it("does not start a second pod after a failed collect run", () => {
    expect(cronjob("invest-buddy-collect")).toMatch(/backoffLimit: 0\b/);
  });
});

describe("M6 SEC 403 is a lockout", () => {
  it("stops at the first 403 from sec.gov without retrying", async () => {
    secEnv(); resetSecLimiter();
    const fetcher = vi.fn(async () => new Response("blocked", { status: 403 }));
    await expect(getText("https://data.sec.gov/submissions/CIK0001045810.json", { fetcher, wait: noWait })).rejects.toBeInstanceOf(RateLimitLockout);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
  it("keeps a 403 from another host an ordinary error", async () => {
    const fetcher = vi.fn(async () => new Response("no", { status: 403 }));
    const error = await getText("https://www.globenewswire.com/rssfeed", { fetcher, wait: noWait }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RateLimitLockout);
  });
});

describe("M7 host allow-list", () => {
  it("allows exactly the hosts the collectors use", () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(["api.stlouisfed.org", "data.sec.gov", "www.globenewswire.com", "www.sec.gov"]);
  });
  it.each([
    "https://169.254.169.254/latest/meta-data", "https://internal.example/x", "https://evil.sec.gov.example/x", "https://www.sec.gov:8443/x",
    "https://user:pw@www.sec.gov/x", "https://[::1]/x", "https://sec.gov/x",
  ])("never sends a request to %s", async (url) => {
    secEnv();
    const fetcher = vi.fn(async () => new Response("ok"));
    await expect(getText(url, { fetcher, wait: noWait })).rejects.toThrow(/Disallowed/);
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("refuses a redirect to a host off the list before requesting it", async () => {
    secEnv(); resetSecLimiter();
    const seen: string[] = [];
    const fetcher = vi.fn(async (url: string) => { seen.push(url); return new Response("", { status: 302, headers: { location: "https://evil.example/p" } }); });
    await expect(getText("https://www.sec.gov/Archives/x", { fetcher, wait: noWait })).rejects.toThrow("Disallowed host in redirect");
    expect(seen).toEqual(["https://www.sec.gov/Archives/x"]);
    vi.unstubAllEnvs();
  });
  it("follows a redirect between allowed hosts", async () => {
    secEnv(); resetSecLimiter();
    const fetcher = vi.fn(async (url: string) => url.includes("data.sec.gov") ? new Response("done") : new Response("", { status: 301, headers: { location: "https://data.sec.gov/y" } }));
    await expect(getText("https://www.sec.gov/x", { fetcher, wait: noWait })).resolves.toBe("done");
    vi.unstubAllEnvs();
  });
  it("keeps filing URLs inside the filing folder", () => {
    const base = "https://www.sec.gov/Archives/edgar/data/1/000000000026000001/";
    expect(filingUrl(base, "form8k.htm")).toBe(`${base}form8k.htm`);
    for (const name of ["https://internal.example/x", "//169.254.169.254/latest", "../../../evil.htm", "%2e%2e/%2e%2e/evil.htm"]) expect(() => filingUrl(base, name)).toThrow("outside");
  });
  it("rejects a path-shaped CIK and a malformed accession from remote JSON", async () => {
    await expect(collectEdgar("NVDA", "1/../../x" as unknown as number, "2026-09-01", async () => "{}")).rejects.toThrow("Invalid CIK");
    const rows = filingRows({ form: ["8-K", "8-K"], accessionNumber: ["../x", "0001045810-26-000001"], primaryDocument: ["a.htm", "b.htm"], filingDate: ["2026-10-01", "2026-10-01"] }, "2026-09-01");
    expect(rows.map((row) => row.primary)).toEqual(["b.htm"]);
  });
});

describe("M8 plainText on hostile input", () => {
  it("does not throw on an out-of-range numeric entity", () => {
    expect(plainText("a &#99999999; b &#0; c &#xD800; d &#x110000; e")).toBe("a b c d e");
    expect(plainText("&#65;&#x42;")).toBe("AB");
  });
  it("keeps text between angle brackets and decodes &amp; last", () => {
    expect(plainText("Revenue <$5M and >3 units")).toBe("Revenue <$5M and >3 units");
    expect(plainText("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
    expect(plainText("a<b>c</b> <!-- x -->d")).toBe("a c d");
  });
  it("removes NUL, which Postgres text rejects", () => {
    expect(plainText("a\u0000b")).not.toContain("\u0000");
  });
  it("stays linear on unclosed markup", () => {
    const started = Date.now();
    plainText("<script ".repeat(50_000) + "<style ".repeat(50_000) + "<a ".repeat(200_000));
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe("response size", () => {
  it("reads at most MAX_RESPONSE_BYTES", async () => {
    const big = "x".repeat(MAX_RESPONSE_BYTES + 1_000_000);
    const text = await getText("https://www.globenewswire.com/rssfeed", { fetcher: async () => new Response(big), wait: noWait });
    expect(text.length).toBe(MAX_RESPONSE_BYTES);
  });
});

describe("M9 schedules", () => {
  const field = (job: string, name: string) => new RegExp(`${name}: "?([^"\\n]+)"?`).exec(cronjob(job))?.[1];
  it("runs collect after the prices job has finished and detect after collect has finished", () => {
    expect(field("invest-buddy-collect", "schedule")).toBe("0 1 * * 2-6");
    expect(field("invest-buddy-detect", "schedule")).toBe("35 1 * * 2-6");
    const prices = readFileSync(join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base/cronjobs.yaml"), "utf8").split(/^---$/m).find((doc) => doc.includes("name: invest-buddy-prices")) ?? "";
    expect(/schedule: "([^"]+)"/.exec(prices)?.[1]).toBe("30 0 * * 2-6");
    const minutes = (cron: string) => { const [m, h] = cron.split(" "); return Number(h) * 60 + Number(m); };
    const deadline = (job: string) => Number(/activeDeadlineSeconds: (\d+)/.exec(job)?.[1]) / 60;
    const startWindow = (job: string) => Number(/startingDeadlineSeconds: (\d+)/.exec(job)?.[1]) / 60;
    expect(minutes("0 1")).toBeGreaterThanOrEqual(minutes("30 0") + startWindow(prices) + deadline(prices));
    expect(minutes("35 1")).toBeGreaterThanOrEqual(minutes("0 1") + startWindow(cronjob("invest-buddy-collect")) + deadline(cronjob("invest-buddy-collect")));
  });
});

describe("safeReason", () => {
  it("strips keys, bearer tokens and newlines and caps the length", () => {
    const text = safeReason(new Error("GET https://x.test/f?series=DGS10&api_key=abc123&x=1 failed\nBearer sk-secret"));
    expect(text).not.toMatch(/abc123|sk-secret|\n/);
    expect(text).toContain("api_key=[redacted]");
    expect(safeReason("x".repeat(500)).length).toBe(200);
  });
});
