import { beforeEach, describe, expect, it } from "vitest";
import { resetGuardState, type Transport } from "./fetch-guard";
import { canonicalUrl, verifyEvidence, type VerifyDeps } from "./verify";
import type { Evidence } from "./types";

const NOW = new Date("2026-10-10T12:00:00Z");
const QUOTE = "The company raised its full year revenue outlook to between 4.1 and 4.3 billion dollars on strong demand.";
const page = (body: string, date = "2026-10-08") => `<html><head><meta property="article:published_time" content="${date}T09:00:00Z"></head><body><nav>Menu</nav><p>${body}</p><script>"${QUOTE}"</script></body></html>`;

const recorded: Record<string, () => Response> = {};
const html = (body: string, status = 200) => () => new Response(body, { status, headers: { "content-type": "text/html" } });
const transport: Transport = async ({ url }) => (recorded[`${url.hostname}${url.pathname}`] ?? (() => new Response("nf", { status: 404 })))();

const deps = (extra: Partial<VerifyDeps> = {}): VerifyDeps => ({ transport, resolve: async () => ["93.184.216.34"], wait: async () => {}, now: () => NOW, ...extra });
const ev = (url: string, over: Partial<Evidence> = {}): Evidence => ({ url, quote: QUOTE, publishedAt: "2026-10-08", sourceName: "Example", sourceClassHint: "primary", ...over });

beforeEach(() => { resetGuardState(); for (const k of Object.keys(recorded)) delete recorded[k]; });

describe("verifyEvidence", () => {
  it("verifies an exact quote and labels the reading", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE));
    const r = await verifyEvidence(ev("https://www.reuters.com/a"), deps());
    expect(r).toMatchObject({ status: "verified", match: "exact", sourceClass: "press", pageDate: "2026-10-08" });
  });
  it("verifies a fuzzy match", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE.replace("outlook", "outlok").replace("demand", "demnd")));
    expect((await verifyEvidence(ev("https://www.reuters.com/a"), deps())).match).toBe("fuzzy");
  });
  it("fails an altered figure as quote_not_found", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE.replace("4.3", "4.8")));
    const r = await verifyEvidence(ev("https://www.reuters.com/a"), deps());
    expect(r.status).toBe("quote_not_found");
  });
  it("does not find a quote that is only inside a script", async () => {
    recorded["www.reuters.com/a"] = html(page("nothing relevant"));
    expect((await verifyEvidence(ev("https://www.reuters.com/a"), deps())).status).toBe("quote_not_found");
  });
  it("marks a 403 as fetch_failed and a refused URL as blocked", async () => {
    recorded["www.reuters.com/a"] = html("no", 403);
    expect((await verifyEvidence(ev("https://www.reuters.com/a"), deps())).status).toBe("fetch_failed");
    expect((await verifyEvidence(ev("https://127.0.0.1/a"), deps())).status).toBe("blocked");
    expect((await verifyEvidence(ev("http://www.reuters.com/a"), deps())).status).toBe("blocked");
  });
  it("marks a PDF as fetch_failed with pdf_not_parsed", async () => {
    recorded["www.sec.gov/a.pdf"] = () => new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    const r = await verifyEvidence(ev("https://www.sec.gov/a.pdf"), deps({ secUserAgent: "Filip filip@example.com" }));
    expect(r).toMatchObject({ status: "fetch_failed", reason: "pdf_not_parsed" });
  });
  it("marks a 120-day-old item stale", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE, "2026-06-12"));
    expect((await verifyEvidence(ev("https://www.reuters.com/a", { publishedAt: "2026-06-12" }), deps())).status).toBe("stale");
    recorded["www.reuters.com/b"] = html(page(QUOTE, "2026-09-12"));
    expect((await verifyEvidence(ev("https://www.reuters.com/b"), deps())).status).toBe("verified");
  });
  it("takes the class from the host even when the hint differs, and flags it", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE));
    recorded["x.com/p"] = html(page(QUOTE));
    const press = await verifyEvidence(ev("https://www.reuters.com/a", { sourceClassHint: "primary" }), deps());
    expect(press).toMatchObject({ sourceClass: "press", hintMismatch: true });
    const social = await verifyEvidence(ev("https://x.com/p", { sourceClassHint: "primary" }), deps());
    expect(social.sourceClass).toBe("social");
  });
  it("sets display_quote only for SEC, openFDA and USAspending; third-party rows stay false", async () => {
    for (const host of ["www.reuters.com", "investors.vertiv.com", "finance.yahoo.com", "x.com"]) {
      recorded[`${host}/a`] = html(page(QUOTE));
      const r = await verifyEvidence(ev(`https://${host}/a`), deps({ symbol: "VRT" }));
      expect(r.status).toBe("verified");
      expect(r.displayQuote).toBe(false);
    }
    recorded["www.sec.gov/a"] = html(page(QUOTE));
    const sec = await verifyEvidence(ev("https://www.sec.gov/a"), deps({ secUserAgent: "Filip filip@example.com" }));
    expect(sec).toMatchObject({ displayQuote: true, dataSourceId: "sec", sourceClass: "primary" });
  });
});

describe("helpers", () => {
  it("canonicalUrl drops fragment and tracking, sorts the query", () => {
    expect(canonicalUrl("https://WWW.Example.com/a/?b=2&utm_x=1&a=1#frag")).toBe("https://www.example.com/a?a=1&b=2");
  });
});
