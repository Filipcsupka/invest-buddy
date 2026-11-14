import { describe, expect, it, vi } from "vitest";
import { ruleGroups } from "@/i18n/rules";
import type { StoreRow } from "./store";
import type { Viewer } from "@/viewer/viewer";
import { evidencedPoints, modelHoldings, readModelPortfolio, quoteCurrency, shortlistAccess, shortlistInputs, shortlistTopN, shortlistViewEnabled } from "./shortlist";

const hits = (...met: string[]) => ruleGroups.flatMap((group) => group.rules).map((rule) => ({ id: rule.id, label: rule.id, detail: "", points: rule.points, matched: met.includes(rule.id), unknown: rule.id === "catalyst" }));
const setupHits = hits("revenue-acceleration", "earnings", "above-ma", "uptrend", "green-volume", "dip");
const row = (ticker: string, over: Record<string, unknown> = {}): StoreRow => ({
  instrument: { ticker, name: ticker, sector: "Unclassified", tier: 1, source: "guide" },
  result: { ticker, asOf: "2026-11-10", state: "Setup met (>=18)", total: 17, ruleHits: setupHits, inputs: { bars: [] }, ...over },
} as unknown as StoreRow);

describe("shortlist access", () => {
  it("is on by default and off only with SHORTLIST_VIEW=off", () => {
    expect(shortlistViewEnabled({})).toBe(true);
    expect(shortlistViewEnabled({ SHORTLIST_VIEW: "on" })).toBe(true);
    expect(shortlistViewEnabled({ SHORTLIST_VIEW: "off" })).toBe(false);
  });
  const owner: Viewer = { tier: "admin", preview: false, owner: true, userId: null };
  const plus: Viewer = { tier: "paid", preview: false, owner: false, userId: "u1", plan: "plus" };
  const trial: Viewer = { tier: "paid", preview: false, owner: false, userId: "u2", plan: "trial" };
  const freeCustomer: Viewer = { tier: "free", preview: false, owner: false, userId: "u3", plan: "free" };
  const passive: Viewer = { tier: "free", preview: false, owner: false, userId: "u5", plan: "passive" };
  // PAYWALL off: an anonymous visitor and a signed-in free customer both resolve to the "paid" soft tier.
  const anonymousSoft: Viewer = { tier: "paid", preview: false };
  const freeSoft: Viewer = { tier: "paid", preview: false, owner: false, userId: "u4", plan: "free" };
  it("shows the owner, Plus and trial the list", () => {
    for (const viewer of [owner, plus, trial]) expect(shortlistAccess(viewer, {})).toBe("full");
  });
  it("locks it for free customers and for anonymous visitors while PAYWALL is off", () => {
    for (const viewer of [freeCustomer, passive, anonymousSoft, freeSoft, { tier: "free", preview: false } as Viewer]) expect(shortlistAccess(viewer, {})).toBe("locked");
  });
  it("hides it for everyone with SHORTLIST_VIEW off", () => {
    for (const viewer of [owner, plus, anonymousSoft]) expect(shortlistAccess(viewer, { SHORTLIST_VIEW: "off" })).toBe("hidden");
  });
});

describe("shortlist inputs", () => {
  it("reads stored evidencedMax, else counts rule hits, else unknown", () => {
    expect(evidencedPoints({ evidencedMax: 21, ruleHits: setupHits })).toBe(21);
    expect(evidencedPoints({ ruleHits: setupHits })).toBe(23);
    expect(evidencedPoints({ ruleHits: [] })).toBeNull();
  });
  it("treats a stored currency as given, a plain ticker as USD and a suffixed ticker without facts as unknown", () => {
    expect(quoteCurrency("HSBA.LSE", { currency: "gbx" })).toBe("GBX");
    expect(quoteCurrency("NVDA", undefined)).toBe("USD");
    expect(quoteCurrency("SAP.XETRA", { currency: null })).toBeNull();
  });
  it("takes only rows of the score date, uses the displayed state and resolves sectors and report dates", () => {
    const facts = new Map([["CHIP", { ticker: "CHIP", instrumentSector: "Unclassified", vendorSector: "Technology", vendorIndustry: null, currency: "USD" }]]);
    const earnings = new Map([["CHIP", { reportDate: "2026-11-12", stale: false }]]);
    const inputs = shortlistInputs([row("CHIP"), row("BIO", { asOf: "2026-11-07" }), row("THIN", { ruleHits: hits("revenue-acceleration") })], "2026-11-10", facts, earnings);
    expect(inputs.map((input) => input.ticker)).toEqual(["CHIP", "THIN"]);
    expect(inputs[0]).toMatchObject({ displayState: "setup", percent: 73.9, evidencedPoints: 23, currency: "USD", sector: "Technology", reportDate: "2026-11-12", reportStale: false });
    expect(inputs[1]).toMatchObject({ displayState: "ignore", sector: "Unknown", reportDate: null });
  });

  it("resolves the theme from stored facts, else from the listing label, else Unknown", () => {
    const facts = new Map([["CHIP", { ticker: "CHIP", instrumentSector: "Unclassified", vendorSector: "Technology", vendorIndustry: "Semiconductors", currency: "USD" }]]);
    const label = row("BIO", { ticker: "BIO" });
    label.instrument.sector = "Biotech";
    const inputs = shortlistInputs([row("CHIP"), label, row("NONE")], "2026-11-10", facts, new Map());
    expect(inputs.map((input) => [input.ticker, input.theme])).toEqual([["CHIP", "ai-semis"], ["BIO", "healthcare"], ["NONE", "unknown"]]);
  });
});

describe("model portfolio", () => {
  it("gives each holding a theme and sector group; a fund without facts is Unknown", () => {
    const facts = new Map([
      ["SNOW", { ticker: "SNOW", instrumentSector: "Cloud & SaaS", vendorSector: "Technology", vendorIndustry: "Software - Application", currency: "USD" }],
      ["CGNX", { ticker: "CGNX", instrumentSector: "Discovery", vendorSector: "Technology", vendorIndustry: "Scientific & Technical Instruments", currency: "USD" }],
    ]);
    const holdings = modelHoldings({ weights: [{ symbol: "SNOW", weightPercent: 16.01 }, { symbol: "CGNX", weightPercent: 1.54 }, { symbol: "CSPX", weightPercent: 10.41 }] }, facts);
    expect(holdings).toEqual([
      { symbol: "SNOW", weightPercent: 16.01, theme: "cloud-software", sector: "Technology" },
      { symbol: "CGNX", weightPercent: 1.54, theme: "robotics", sector: "Technology" },
      { symbol: "CSPX", weightPercent: 10.41, theme: "unknown", sector: "Unknown" },
    ]);
  });

  it("uses the listing label when no facts were read", () => {
    expect(modelHoldings({ weights: [{ symbol: "NVDA", weightPercent: 34 }] }, new Map(), () => "AI & semiconductors")[0]).toMatchObject({ theme: "ai-semis", sector: "Technology" });
  });

  /** Fake read-only client: the snapshot query returns `snapshot`; the classification query returns `facts` or throws. */
  const fakeDb = (snapshot: Record<string, unknown> | null, facts: "ok" | "fail" = "ok") => {
    const sql: string[] = [];
    return { sql, db: { query: async (text: string) => {
      sql.push(text);
      if (text.includes("FROM portfolio_snapshots")) return { rows: snapshot ? [{ snapshot }] : [] };
      if (facts === "fail") throw new Error("classification read failed");
      return { rows: [{ ticker: "SNOW", instrument_sector: "Cloud & SaaS", vendor_sector: "Technology", vendor_industry: "Software - Application", currency: "USD" }] };
    } } as never };
  };
  const real = { asOf: "2026-11-13", publishOn: "2026-11-16", sample: false, weights: [{ symbol: "SNOW", weightPercent: 100 }], series: [] };

  it("reads the newest stored snapshot for the owner and the newest published one for everyone else", async () => {
    const owner = fakeDb(real);
    expect(await readModelPortfolio(owner.db, "owner", "2026-11-14")).toEqual({ asOf: "2026-11-13", holdings: [{ symbol: "SNOW", weightPercent: 100, theme: "cloud-software", sector: "Technology" }] });
    expect(owner.sql[0]).not.toContain("publish_on");
    const visitor = fakeDb(real);
    await readModelPortfolio(visitor.db, "public", "2026-11-14");
    expect(visitor.sql[0]).toContain("publish_on <= $1");
  });

  it("skips a stored sample snapshot, as latestPortfolio does", async () => {
    const { db, sql } = fakeDb({ ...real, sample: true });
    expect(await readModelPortfolio(db, "owner", "2026-11-14")).toBeNull();
    expect(sql.some((text) => text.includes("FROM instruments"))).toBe(false);
  });

  it("throws and logs when the classification read fails, so the lens is switched off", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(readModelPortfolio(fakeDb(real, "fail").db, "public", "2026-11-14")).rejects.toThrow("classification read failed");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("model_lens_read_failed"));
    } finally { warn.mockRestore(); }
  });

  it("reads SHORTLIST_TOP_N with a default of 6", () => {
    expect(shortlistTopN({})).toBe(6);
    expect(shortlistTopN({ SHORTLIST_TOP_N: "8" })).toBe(8);
    expect(shortlistTopN({ SHORTLIST_TOP_N: "99" })).toBe(6);
  });
});
