import { describe, expect, it } from "vitest";
import { ruleGroups } from "@/i18n/rules";
import type { StoreRow } from "./store";
import type { Viewer } from "@/viewer/viewer";
import { evidencedPoints, quoteCurrency, shortlistAccess, shortlistInputs, shortlistViewEnabled } from "./shortlist";

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
});
