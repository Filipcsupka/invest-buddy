import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { etfScore, type EtfScoreFacts } from "@/engine/etf-score";
import { getEtfMessages } from "@/i18n/etf-messages";
import { EtfStoredScore } from "./score";

const facts: EtfScoreFacts = { asOf: "2026-11-12", instrumentType: "ETF", name: "Plain ETF", detailStatus: "ok", lastSeen: "2026-11-12", terPct: 0.1, aumEur: 100_000_000, medianValueTradedEur: null, replication: null, ucitsConfirmed: null, inceptionDate: null, domicile: null, assetClass: null, usEquityWeightPct: null, barsCount: 0, close: null, sma50: null, sma200: null, return12to1m: null, maxDrawdown1y: null, topTenWeightPct: null, maxCountryWeightPct: null, maxSectorWeightPct: null, holdingsCount: null };

it.each(["en", "sk"] as const)("shows stored score coverage and missing facts in %s", (locale) => {
  const html = renderToStaticMarkup(<EtfStoredScore score={etfScore(facts)} m={getEtfMessages(locale)} />);
  expect(html).toContain(locale === "en" ? "2 of 8 groups with data" : "Údaje v 2 zo 8 skupín");
  expect(html).toContain(locale === "en" ? "Missing data" : "Chýbajúci údaj");
  expect(html).toContain(locale === "en" ? "price history" : "cenová história");
});

it("does not render a percentage when a rule fails", () => {
  const html = renderToStaticMarkup(<EtfStoredScore score={etfScore({ ...facts, terPct: 1.6 })} m={getEtfMessages("en")} />);
  expect(html).toContain("Rejected by rule");
  expect(html).not.toContain("%");
});
