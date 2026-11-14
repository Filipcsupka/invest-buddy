import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { etfScore, type EtfScoreFacts } from "@/engine/etf-score";
import { getEtfMessages } from "@/i18n/etf-messages";
import { EtfStoredScore } from "./score";

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
