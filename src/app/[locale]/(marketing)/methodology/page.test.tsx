import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { RULESET_DATE, RULESET_VERSION } from "@/config/rules";
import { messages } from "@/i18n/messages";
import Methodology from "./page";

const props = (locale: string) => ({ params: Promise.resolve({ locale }) });
const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; });

describe("methodology page", () => {
  it.each([["en", "ETF rating", "Sources for the criteria"], ["sk", "Hodnotenie ETF", "chýbajúcich údajov"]])("documents stored ETF rules in %s", async (locale, title, phrase) => {
    const html = renderToStaticMarkup(await Methodology(props(locale)));
    expect(html).toContain('id="etf-rating"');
    expect(html).toContain(title);
    expect(html).toContain(phrase);
    expect(html).toContain("etf-v2-2026-11-12");
    expect(html).toContain("The Journal of Wealth Management");
    expect(html).not.toContain("abstract_id=962461");
    expect(html).not.toContain("eodhd.com");
  });
  it.each([
    ["en", ["AUM, trading liquidity, fund age or trend evidence", "more than 30 days", "ISIN mismatch", "not_etf", "insufficient-data results hide the percentage"]],
    ["sk", ["AUM, likvidite obchodovania, veku fondu alebo trende", "starším než 30 dní", "nesúladom ISIN", "not_etf", "nedostatok údajov skryjú percento"]],
  ] as const)("explains ETF evidence and hidden percentages in %s", async (locale, phrases) => {
    const html = renderToStaticMarkup(await Methodology(props(locale)));
    for (const phrase of phrases) expect(html).toContain(phrase);
  });
  it.each(["en", "sk"] as const)("shows version, band steps, worked figures, limits and data provider in %s", async (locale) => {
    process.env.DATA_MODE = "db";
    const html = renderToStaticMarkup(await Methodology(props(locale)));
    expect(html).toContain(RULESET_VERSION);
    expect(html).toContain(RULESET_DATE);
    for (const n of ["72", "60", "48"]) expect(html).toContain(n);
    expect(html).toContain("Twelve Data");
    expect(html).toContain("17");
    expect(html).toContain("74");
    expect(html).toContain("82");
    const m = messages[locale].methodology;
    expect(html).toContain(m.limitsTitle);
    expect(html).toContain(m.workedTitle);
    expect(html).not.toMatch(/\{(version|date)\}/);
  });

  it("derives the rules date from the version strings", () => {
    expect(RULESET_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(RULESET_VERSION).toContain(RULESET_DATE);
  });

  it("keeps placeholders and figures identical in EN and SK", () => {
    for (const key of ["versionLine", "workedBody", "workedCap", "limitsBody", "dataBodyLive"] as const) {
      const en = messages.en.methodology[key];
      const sk = messages.sk.methodology[key];
      expect(sk.match(/\{\w+\}/g) ?? []).toEqual(en.match(/\{\w+\}/g) ?? []);
    }
    for (const key of ["workedBody", "workedCap"] as const) {
      const figures = (text: string) => (text.match(/\d+/g) ?? []).filter((n) => n !== "2026" && n !== "9");
      expect(figures(messages.sk.methodology[key])).toEqual(figures(messages.en.methodology[key]));
    }
    expect(messages.sk.status.legendMissing.match(/\d+/g)).toEqual(messages.en.status.legendMissing.match(/\d+/g));
  });
});
