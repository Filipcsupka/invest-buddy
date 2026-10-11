import { beforeEach, describe, expect, it } from "vitest";
import type { CollectedDocument } from "../collectors/types";
import { resetGuardState, type Transport } from "./fetch-guard";
import { canonicalUrl, gradeFinding, publisherKey, verifyEvidence, verifyFinding, type VerifyDeps } from "./verify";
import { READING_LABEL, type ResearchEvidence } from "./types";

const NOW = new Date("2026-10-10T12:00:00Z");
const QUOTE = "The company raised its full year revenue outlook to between 4.1 and 4.3 billion dollars on strong demand.";
const page = (body: string, date = "2026-10-08") => `<html><head><meta property="article:published_time" content="${date}T09:00:00Z"></head><body><nav>Menu</nav><p>${body}</p><script>"${QUOTE}"</script></body></html>`;

const recorded: Record<string, () => Response> = {};
const html = (body: string, status = 200) => () => new Response(body, { status, headers: { "content-type": "text/html" } });
const transport: Transport = async ({ url }) => (recorded[`${url.hostname}${url.pathname}`] ?? (() => new Response("nf", { status: 404 })))();

function fakeDb() {
  const snaps = new Map<string, number>();
  const queries: string[] = [];
  return {
    snaps, queries,
    async query(sql: string, params: unknown[] = []) {
      queries.push(sql);
      if (/INSERT INTO raw_snapshots/.test(sql)) {
        const k = `${params[0]}|${params[1]}|${params[3]}`;
        if (snaps.has(k)) return { rows: [] };
        snaps.set(k, snaps.size + 1);
        return { rows: [{ id: String(snaps.size) }] };
      }
      if (/FROM raw_snapshots/.test(sql)) return { rows: [{ id: String(snaps.get(`${params[0]}|${params[1]}|${params[2]}`)) }] };
      return { rows: [] };
    },
  } as unknown as NonNullable<VerifyDeps["db"]> & { snaps: Map<string, number>; queries: string[] };
}

const deps = (extra: Partial<VerifyDeps> = {}): VerifyDeps => ({ transport, resolve: async () => ["93.184.216.34"], wait: async () => {}, now: () => NOW, ...extra });
const ev = (url: string, over: Partial<ResearchEvidence> = {}): ResearchEvidence => ({ url, quote: QUOTE, publishedAt: "2026-10-08", sourceName: "Example", sourceClassHint: "primary", ...over });

beforeEach(() => { resetGuardState(); for (const k of Object.keys(recorded)) delete recorded[k]; });

describe("verifyEvidence", () => {
  it("verifies an exact quote and labels the reading", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE));
    const r = await verifyEvidence(ev("https://www.reuters.com/a"), deps());
    expect(r).toMatchObject({ status: "verified", match: "exact", sourceClass: "press", readingLabel: READING_LABEL, pageDate: "2026-10-08" });
  });
  it("verifies a fuzzy match", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE.replace("outlook", "outlok").replace("demand", "demnd")));
    expect((await verifyEvidence(ev("https://www.reuters.com/a"), deps())).match).toBe("fuzzy");
  });
  it("fails an altered figure as quote_not_found", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE.replace("4.3", "4.8")));
    const r = await verifyEvidence(ev("https://www.reuters.com/a"), deps());
    expect(r.status).toBe("quote_not_found");
    expect(r.readingLabel).toBeUndefined();
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
  it("stores the same page once (D17 dedupe) and one document per canonical URL", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE));
    const db = fakeDb();
    const docs: CollectedDocument[] = [];
    const documents = { async upsertDocument(doc: CollectedDocument) { docs.push(doc); return { id: 7, written: true }; } };
    const a = await verifyEvidence(ev("https://www.reuters.com/a?utm_source=x#top"), deps({ db, documents, symbol: "VRT" }));
    resetGuardState();
    const b = await verifyEvidence(ev("https://www.reuters.com/a"), deps({ db, documents, symbol: "VRT" }));
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(db.snaps.size).toBe(1);
    expect([...db.snaps.keys()][0]).toContain("research_web|research:https://www.reuters.com/a|");
    expect(docs[0]).toMatchObject({ docType: "research_page", symbol: "VRT", url: "https://www.reuters.com/a", sourceId: "research_web" });
    expect(docs[0].meta.display_allowed).toBe(false);
    expect(a.documentId).toBe(7);
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
  it("reserves each request under research_web and reports a reached cap as fetch_failed", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE));
    const calls: string[] = [];
    const { CapReached } = await import("../data/usage");
    const ledger = { async reserve(source: string) { calls.push(source); if (calls.length > 2) throw new CapReached(source, "daily_cap", "cap"); return { source, day: "x", requests: 1 }; } };
    expect((await verifyEvidence(ev("https://www.reuters.com/a"), deps({ ledger }))).status).toBe("verified");
    expect(calls).toEqual(["research_web", "research_web"]);
    resetGuardState();
    expect((await verifyEvidence(ev("https://www.reuters.com/a"), deps({ ledger }))).status).toBe("fetch_failed");
  });
});

describe("grading", () => {
  const item = (url: string, status: "verified" | "quote_not_found" | "fetch_failed" | "blocked" | "stale", sourceClass: "primary" | "press" | "aggregator" | "social") =>
    ({ url, status, reason: "", sourceClass, hintMismatch: false, dataSourceId: "research_web", displayQuote: false }) as const;
  it("confirms on one verified primary item", () => {
    expect(gradeFinding([item("https://www.sec.gov/a", "verified", "primary")])).toMatchObject({ status: "verified", confirmed: true, readingLabel: READING_LABEL });
  });
  it("confirms on two press publishers, not on one publisher twice", () => {
    expect(gradeFinding([item("https://www.reuters.com/a", "verified", "press"), item("https://www.cnbc.com/b", "verified", "press")]).confirmed).toBe(true);
    expect(gradeFinding([item("https://www.reuters.com/a", "verified", "press"), item("https://uk.reuters.com/b", "verified", "press")]).confirmed).toBe(false);
    expect(gradeFinding([item("https://www.reuters.com/a", "verified", "press")])).toMatchObject({ status: "verified", confirmed: false });
  });
  it("is lead_only when only social passed", () => {
    expect(gradeFinding([item("https://x.com/a", "verified", "social"), item("https://www.reuters.com/a", "fetch_failed", "press")])).toMatchObject({ status: "lead_only", confirmed: false });
  });
  it("carries the closest failure when nothing passed", () => {
    expect(gradeFinding([item("https://a.example/x", "blocked", "aggregator"), item("https://b.example/x", "fetch_failed", "aggregator")]).status).toBe("fetch_failed");
    expect(gradeFinding([item("https://a.example/x", "quote_not_found", "aggregator"), item("https://b.example/x", "stale", "aggregator")]).status).toBe("stale");
    expect(gradeFinding([]).status).toBe("fetch_failed");
  });
  it("verifyFinding verifies every item in order", async () => {
    recorded["www.reuters.com/a"] = html(page(QUOTE));
    recorded["www.cnbc.com/b"] = html(page(QUOTE));
    const r = await verifyFinding({ symbol: "VRT", evidence: [ev("https://www.reuters.com/a"), ev("https://www.cnbc.com/b")] }, deps());
    expect(r).toMatchObject({ status: "verified", confirmed: true });
    expect(r.items).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("canonicalUrl drops fragment and tracking, sorts the query", () => {
    expect(canonicalUrl("https://WWW.Example.com/a/?b=2&utm_x=1&a=1#frag")).toBe("https://www.example.com/a?a=1&b=2");
  });
  it("publisherKey keeps one key per site", () => {
    expect(publisherKey("https://uk.reuters.com/a")).toBe("reuters.com");
    expect(publisherKey("https://news.bbc.co.uk/a")).toBe("bbc.co.uk");
  });
});
