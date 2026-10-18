import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScoreResult } from "@/engine";
import { scoredUniverse } from "@/data/scored";
import { inputSources, ruleSourceNotes, ruleSources, sourceSummary, toRow } from "./view-model";
import { SourceList, SourceNotes } from "./source-list";

const XBRL = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json";
const RELEASE = "https://www.sec.gov/Archives/edgar/data/1/ex99.htm";
const base = async (): Promise<ScoreResult> => {
  const r = (await scoredUniverse())[0].result;
  return { ...r, inputs: { ...r.inputs, fundamentals: { ...r.inputs.fundamentals, revenueAccelerating: true, revenueDeclining: false, epsBeat: true, guidanceRaised: true, productCatalyst: true, insiderOrInstitutionalAccumulation: true, revenueGrowthCurrent: 30, revenueGrowthPrior: 20 }, macro: { growthSectorRotation: true, dataTailwind: true } } };
};
const withSources = (r: ScoreResult, agreement: Record<string, string>, sources: ScoreResult["sources"]): ScoreResult => ({ ...r, agreement, sources });

describe("rule sources by agreement type", () => {
  it("xbrl_override: SEC XBRL link with https href", async () => {
    const r = withSources(await base(), { revenueAccelerating: "xbrl_override", revenueDeclining: "xbrl_override" }, { revenueAccelerating: [{ kind: "xbrl", href: XBRL, publishedAt: null }] });
    expect(ruleSources("en", r, "revenue-acceleration")).toEqual([expect.objectContaining({ kind: "xbrl", label: "SEC XBRL company facts", href: XBRL })]);
  });
  it("xbrl_override on a score stored before sources existed still names SEC XBRL data, without a link", async () => {
    const r = { ...(await base()), agreement: { revenueAccelerating: "xbrl_override" } };
    expect(ruleSources("en", r, "revenue-acceleration")).toEqual([expect.objectContaining({ kind: "xbrl", href: null })]);
  });
  it("insider flag confirmed from Form 4 names SEC Form 4, not SEC XBRL, in English and Slovak", async () => {
    const r = withSources(await base(), { insiderOrInstitutionalBuying: "xbrl_override" }, { insiderOrInstitutionalBuying: [{ kind: "form4", href: "https://www.sec.gov/a.xml", publishedAt: "2026-09-22" }] });
    expect(ruleSources("en", r, "accumulation").map((s) => s.label)).toEqual(["SEC Form 4"]);
    expect(ruleSources("sk", r, "accumulation").map((s) => s.label)).toEqual(["SEC Form 4"]);
    const bare = { ...(await base()), agreement: { insiderOrInstitutionalBuying: "xbrl_override" } };
    expect(ruleSources("en", bare, "accumulation")).toEqual([expect.objectContaining({ kind: "form4", label: "SEC Form 4", href: null })]);
  });
  it("data_rule (epsBeat): Alpha Vantage label, no href, no numbers", async () => {
    const r = withSources(await base(), { epsBeat: "data_rule" }, { epsBeat: [{ kind: "alphavantage", href: null, publishedAt: "2026-08-26" }] });
    const items = inputSources("en", r, "epsBeat");
    expect(items).toEqual([expect.objectContaining({ label: "Alpha Vantage earnings data", href: null, dateLabel: "26 Aug 2026" })]);
    expect(JSON.stringify(items)).not.toMatch(/surprise|estimate/i);
  });
  it("verified_single: stored release with link and date", async () => {
    const r = withSources(await base(), { guidanceRaised: "verified_single" }, { guidanceRaised: [{ kind: "release", href: RELEASE, publishedAt: "2026-08-26" }] });
    expect(inputSources("en", r, "guidanceRaised")).toEqual([expect.objectContaining({ label: "Earnings release", href: RELEASE, date: "2026-08-26" })]);
  });
  it("agree: every document of the rule's fields, deduplicated", async () => {
    const item = { kind: "10-Q" as const, href: "https://www.sec.gov/10q.htm", publishedAt: "2026-08-28" };
    const r = withSources(await base(), { epsBeat: "agree", guidanceRaised: "agree" }, { epsBeat: [item], guidanceRaised: [item, { kind: "release", href: RELEASE, publishedAt: "2026-08-26" }] });
    expect(ruleSources("en", r, "earnings").map((s) => s.label)).toEqual(["10-Q", "Earnings release"]);
  });
  it("single (unconfirmed, value unknown): No source yet", async () => {
    const b = await base();
    const r = { ...b, agreement: { productCatalyst: "single" }, inputs: { ...b.inputs, fundamentals: { ...b.inputs.fundamentals, productCatalyst: null } } };
    expect(ruleSources("en", r, "catalyst")).toEqual([]);
    expect(renderToStaticMarkup(<SourceList locale="en" items={ruleSources("en", r, "catalyst")} />)).toContain("No source yet");
  });
  it("catalyst without a source says what is missing, in EN and SK; other rows keep the short text", () => {
    const en = renderToStaticMarkup(<SourceList locale="en" items={[]} emptyNote />);
    expect(en).toContain("No source yet");
    expect(en).toContain("last 90 days");
    expect(en).toContain("items 1.01, 2.02, 7.01 and 8.01");
    const sk = renderToStaticMarkup(<SourceList locale="sk" items={[]} emptyNote />);
    expect(sk).toContain("Zatiaľ bez zdroja");
    expect(sk).toContain("posledných 90 dní");
    expect(renderToStaticMarkup(<SourceList locale="en" items={[]} />)).not.toContain("90 days");
  });
  it("technical rules name own price bars; macro rules name their data, none when unknown", async () => {
    const r = await base();
    expect(ruleSources("en", r, "dip")).toEqual([expect.objectContaining({ label: "Own price bars", href: null })]);
    expect(ruleSources("en", r, "macro-data").map((s) => [s.label, s.href])).toEqual([["FRED 10-year yield", null], ["Market volatility index", null]]);
    expect(ruleSources("en", r, "rotation")[0].label).toContain("Own price data");
    const unknown = { ...r, inputs: { ...r.inputs, macro: { growthSectorRotation: null, dataTailwind: null } } };
    expect(ruleSources("en", unknown, "macro-data")).toEqual([]);
    expect(ruleSources("en", unknown, "rotation")).toEqual([]);
  });
  it("Slovak labels", async () => {
    const r = withSources(await base(), { guidanceRaised: "verified_single" }, { guidanceRaised: [{ kind: "form4", href: null, publishedAt: null }] });
    expect(inputSources("sk", r, "guidanceRaised")[0].label).toBe("SEC Form 4");
    expect(ruleSources("sk", r, "dip")[0].label).toBe("Vlastné cenové údaje");
  });
});

describe("link safety", () => {
  it("drops an http href and any href on a third-party kind, even if the stored audit has one", async () => {
    const r = withSources(await base(), {}, { epsBeat: [{ kind: "alphavantage", href: "https://www.alphavantage.co/query", publishedAt: null }], guidanceRaised: [{ kind: "release", href: "http://www.sec.gov/ex99.htm", publishedAt: null }, { kind: "release", href: "javascript:alert(1)", publishedAt: null }] });
    expect(ruleSources("en", r, "earnings").every((s) => s.href === null)).toBe(true);
  });
  it("renders a link with new tab, noopener noreferrer, date and a screen reader note; text items have no anchor", async () => {
    const r = withSources(await base(), { guidanceRaised: "verified_single", epsBeat: "data_rule" }, { guidanceRaised: [{ kind: "release", href: RELEASE, publishedAt: "2026-08-26" }], epsBeat: [{ kind: "alphavantage", href: null, publishedAt: null }] });
    const html = renderToStaticMarkup(<SourceList locale="en" items={ruleSources("en", r, "earnings")} />);
    expect(html).toContain(`href="${RELEASE}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('<time dateTime="2026-08-26">');
    expect(html).toContain("opens in a new tab");
    expect(html).toContain("Alpha Vantage earnings data");
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});

describe("source summary", () => {
  it("counts distinct sources per type under the score", async () => {
    const r = withSources(await base(), { revenueAccelerating: "xbrl_override" }, { revenueAccelerating: [{ kind: "xbrl", href: XBRL, publishedAt: null }], guidanceRaised: [{ kind: "release", href: RELEASE, publishedAt: "2026-08-26" }], insiderOrInstitutionalBuying: [{ kind: "form4", href: "https://www.sec.gov/a.xml", publishedAt: "2026-09-01" }, { kind: "form4", href: "https://www.sec.gov/b.xml", publishedAt: "2026-09-02" }] });
    expect(sourceSummary("en", r)).toBe("Data sources: Earnings release (1), SEC Form 4 (2), SEC XBRL company facts (1), FRED 10-year yield (1), Market volatility index (1), Own price bars (1), Own price data (SPY and universe tickers) (1)");
    expect(sourceSummary("sk", r)).toContain("Zdroje údajov: ");
  });
});

describe("honest source notes (ST7)", () => {
  it("computed rules say where they come from and link to the methodology, EN and SK", async () => {
    const r = await base();
    const en = (id: string) => ruleSourceNotes("en", r, id, false);
    expect(en("rotation")).toEqual({ replacesSources: true, notes: [expect.objectContaining({ text: "Computed from price data", href: "/en/methodology#source-labels" })] });
    expect(en("macro-data").notes[0].text).toBe("Computed from macro data (FRED)");
    expect(ruleSourceNotes("sk", r, "rotation", false).notes[0]).toMatchObject({ text: "Vypočítané z cenových údajov", href: "/sk/methodology#source-labels" });
    expect(ruleSourceNotes("sk", r, "macro-data", false).notes[0].text).toBe("Vypočítané z makro údajov (FRED)");
  });
  it("insider rule with no purchase names the Form 4 check, the 90-day range and the ticker link, EN and SK", async () => {
    const b = await base();
    const r = { ...b, ticker: "NVDA", asOf: "2026-10-09", inputs: { ...b.inputs, fundamentals: { ...b.inputs.fundamentals, insiderOrInstitutionalAccumulation: false } } };
    const en = ruleSourceNotes("en", r, "accumulation", false);
    expect(en.replacesSources).toBe(true);
    expect(en.notes[0].text).toContain("SEC Form 4: no open-market purchases in the last 90 days");
    expect(en.notes[0].text).toContain("2026");
    expect(en.notes[0].href).toBe("/en/insiders?ticker=NVDA");
    const html = renderToStaticMarkup(<SourceNotes notes={en.notes} />);
    expect(html).toContain('href="/en/insiders?ticker=NVDA"');
    expect(html).not.toContain("No source yet");
    const sk = ruleSourceNotes("sk", r, "accumulation", false);
    expect(sk.notes[0].text).toContain("žiadne nákupy na voľnom trhu za posledných 90 dní");
    expect(sk.notes[0].href).toBe("/sk/insiders?ticker=NVDA");
  });
  it("insider rule with a stored purchase keeps the Form 4 source and adds no 'none' note", async () => {
    const r = withSources(await base(), { insiderOrInstitutionalBuying: "xbrl_override" }, { insiderOrInstitutionalBuying: [{ kind: "form4", href: "https://www.sec.gov/a.xml", publishedAt: "2026-09-22" }] });
    expect(ruleSourceNotes("en", r, "accumulation", false).replacesSources).toBe(false);
  });
  it("model readings: single, checked against the quote, two sources, SEC data; EN and SK", async () => {
    const note = async (field: string, rule: string, agreement: string, locale: "en" | "sk") => ruleSourceNotes(locale, { ...(await base()), agreement: { [field]: agreement } }, rule, false).notes.map((n) => n.text);
    expect(await note("guidanceRaised", "earnings", "single", "en")).toEqual(["One reading (model), not confirmed by a second source"]);
    expect(await note("productCatalyst", "catalyst", "verified_single", "en")).toEqual(["One reading (model) checked against the quote"]);
    expect(await note("epsBeat", "earnings", "agree", "en")).toEqual(["Two independent sources agree"]);
    expect(await note("revenueAccelerating", "revenue-acceleration", "xbrl_override", "en")).toEqual(["Computed from SEC data"]);
    expect(await note("productCatalyst", "catalyst", "verified_single", "sk")).toEqual(["Jedno čítanie (model) overené voči citátu"]);
    expect(await note("epsBeat", "earnings", "agree", "sk")).toEqual(["Dva nezávislé zdroje sa zhodujú"]);
  });
  it("unknown rows say what fills them and when, EN and SK; technical rows say computed", async () => {
    const r = await base();
    const en = ruleSourceNotes("en", r, "catalyst", true);
    expect(en.replacesSources).toBe(true);
    expect(en.notes[0].text).toContain("nightly review");
    expect(en.notes[0].text).toContain("only for tickers with new filings, up to 6 per night");
    expect(en.notes[0].text).toContain("Earnings-season filings refresh it");
    expect(ruleSourceNotes("sk", r, "earnings", true).notes[0].text).toContain("najviac 6 za noc");
    expect(ruleSourceNotes("en", r, "dip", true).notes[0].text).toContain("price and macro update");
  });
  it("agreement labels no longer say 'one source'", async () => {
    const { getMessages } = await import("@/i18n");
    for (const l of ["en", "sk"] as const) expect(JSON.stringify(getMessages(l).agreement)).not.toMatch(/one source|jeden zdroj/);
    expect(getMessages("en").agreement.verified_single).toBe("one reading (model), checked against the quote");
  });
});


describe("public score view model", () => {
  it("uses core hits for percent and keeps the stored total untouched", async () => {
    const { instrument, result } = (await scoredUniverse())[0];
    const allCore = result.ruleHits.map((hit) => ({ ...hit, matched: hit.id !== "catalyst", unknown: hit.id === "catalyst" }));
    const a = toRow("en", { instrument, result: { ...result, state: "Watch", total: 25, ruleHits: allCore } });
    const b = toRow("en", { instrument, result: { ...result, state: "Watch", total: 25, ruleHits: allCore.map((hit) => hit.id === "catalyst" ? { ...hit, matched: true, unknown: false } : hit) } });
    expect(a.total).toBe(25);
    expect(a.percent).toBe(100);
    expect(b.percent).toBe(100);
    expect(a.state).toBe("setup");
    expect(a.coreTotal).toBe(9);
    expect(a.bonusLabel).toContain("no data");
    expect(b.bonusLabel).toContain("Met");
  });

  it("localizes core completeness and bonus in Slovak", async () => {
    const { instrument, result } = (await scoredUniverse())[0];
    const item = toRow("sk", { instrument, result: { ...result, state: "Watch", ruleHits: result.ruleHits.map((hit) => ({ ...hit, matched: hit.id !== "catalyst" && hit.id !== "earnings", unknown: hit.id === "catalyst" || hit.id === "earnings" })) } });
    expect(item.pointsKnown).toBe(8);
    expect(item.statusAria).toContain("hlavných pravidiel");
    expect(item.bonusLabel).toContain("Katalyzátor");
  });
});
