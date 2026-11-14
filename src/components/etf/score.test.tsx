import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { etfScore, type EtfScoreFacts } from "@/engine/etf-score";
import { getEtfMessages } from "@/i18n/etf-messages";
import { BandBadge, EtfRatingCell, EtfStoredScore } from "./score";

const facts: EtfScoreFacts = { asOf: "2026-11-12", instrumentType: "ETF", name: "Plain ETF", detailStatus: "ok", lastSeen: "2026-11-12", terPct: 0.1, aumEur: 100_000_000, medianValueTradedEur: null, replication: null, ucitsConfirmed: null, inceptionDate: null, domicile: null, assetClass: null, usEquityWeightPct: null, barsCount: 0, close: null, sma50: null, sma200: null, return12to1m: null, maxDrawdown1y: null, topTenWeightPct: null, maxCountryWeightPct: null, maxSectorWeightPct: null, holdingsCount: null };

it.each(["en", "sk"] as const)("shows stored score coverage and missing facts in %s", (locale) => {
  const html = renderToStaticMarkup(<EtfStoredScore score={etfScore(facts)} m={getEtfMessages(locale)} />);
  expect(html).toContain(locale === "en" ? "2 of 7 applicable groups with data" : "Údaje v 2 z 7 použiteľných skupín");
  expect(html).toContain(locale === "en" ? "Missing data" : "Chýbajúci údaj");
  expect(html).toContain(locale === "en" ? "price history" : "cenová história");
});

it("does not render a percentage when a rule fails", () => {
  const html = renderToStaticMarkup(<EtfStoredScore score={etfScore({ ...facts, terPct: 1.6 })} m={getEtfMessages("en")} />);
  expect(html).toContain("Rejected by rule");
  expect(html).not.toContain("%");
});

it("labels a fallback v2 rating and keeps its four-group coverage", () => {
  const legacy = { ...etfScore(facts), rulesVersion: "etf-v2-2026-11-12", state: "rated" as const, rejections: [], percent: 65, incompleteData: false };
  const html = renderToStaticMarkup(<EtfStoredScore score={legacy} m={getEtfMessages("en")} />);
  expect(html).toContain("65% · Rules met");
  expect(html).toContain("2 of 4 applicable groups with data");
  expect(html).toContain("Previous rating version");
  expect(html).not.toContain("Incomplete data");
});

const rated = (percent: number, evidencedMax: number, groups: string[], extra: Partial<ReturnType<typeof etfScore>> = {}) => ({ ...etfScore(facts), band: undefined, incompleteData: undefined, state: "rated" as const, rejections: [], percent, evidencedMax, earned: Math.round(percent * evidencedMax / 100),
  rules: groups.map((group) => ({ id: group, group: group as never, max: 10, earned: 5, evidenced: true, threshold: "", value: null, date: null })), ...extra });

it.each([
  ["en", "Rules met", "6 of 8 groups"],
  ["sk", "Spĺňa pravidlá", "6 z 8 skupín"],
] as const)("renders a compact rating cell with band and coverage in %s", (locale, band, groups) => {
  const score = rated(80, 90, ["cost", "size", "liquidity", "structure", "trend", "income"], { rulesVersion: "etf-v3-2026-11-13" });
  const html = renderToStaticMarkup(<EtfRatingCell score={score} m={getEtfMessages(locale)} />);
  expect(html).toContain("80%");
  expect(html).toContain(`data-band="rulesMet">${band}<`);
  expect(html).toContain(groups);
  expect(html).not.toContain(locale === "en" ? "Incomplete data" : "Neúplné údaje");
});

it("caps thin evidence at Mostly met and flags it", () => {
  const html = renderToStaticMarkup(<EtfRatingCell score={rated(95, 50, ["cost", "size"], { rulesVersion: "etf-v3-2026-11-13" })} m={getEtfMessages("en")} />);
  expect(html).toContain('data-band="mostlyMet">Mostly met<');
  expect(html).toContain("2 of 7 groups · Incomplete data");
});

it("prints a non-band state without a percentage and a pending state for missing scores", () => {
  const m = getEtfMessages("en");
  expect(renderToStaticMarkup(<EtfRatingCell score={etfScore({ ...facts, terPct: 1.6 })} m={m} />)).toContain("Rejected by rule");
  expect(renderToStaticMarkup(<EtfRatingCell score={etfScore({ ...facts, terPct: 1.6 })} m={m} />)).not.toContain("%");
  expect(renderToStaticMarkup(<EtfRatingCell score={undefined} m={m} />)).toContain("Rating not computed");
  const legacy = renderToStaticMarkup(<EtfRatingCell score={rated(65, 30, ["cost"], { rulesVersion: "etf-v2-2026-11-12" })} m={m} />);
  expect(legacy).toContain("1 of 4 groups · Previous rating version");
  expect(legacy).not.toContain("data-band");
});

it("labels every band in both locales", () => {
  for (const locale of ["en", "sk"] as const) for (const band of ["rulesMet", "mostlyMet", "partlyMet", "fewMet"] as const) {
    const html = renderToStaticMarkup(<BandBadge band={band} m={getEtfMessages(locale)} />);
    expect(html).toContain(getEtfMessages(locale).scoreStates[band]);
    expect(html).toContain(`data-band="${band}"`);
  }
});
