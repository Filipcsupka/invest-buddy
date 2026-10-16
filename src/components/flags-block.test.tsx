import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMessages, type Locale } from "@/i18n";
import { messages } from "@/i18n/messages";
import { companyFlags } from "@/engine/flags";
import { statusView } from "@/engine/status";
import { ruleGroups } from "@/i18n/rules";
import { IdeaCard } from "./idea-card";
import { FlagsBlock } from "./flags-block";
import { StatusPanel } from "./status-slider";
import { sampleIdeas } from "../ideas/fixtures";

const bars = Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, open: 10, high: 10, low: 10, close: 10, volume: 50_000 }));
const flags = companyFlags({ bars, shares: [{ periodEnd: "2025-09-30", value: 100_000_000 }, { periodEnd: "2026-09-30", value: 130_000_000 }], operatingIncome: null, interestExpense: null, shortInterestPercent: null });
const render = (locale: Locale) => renderToStaticMarkup(<FlagsBlock flags={flags} locale={locale} m={getMessages(locale)} />);

describe("flags block", () => {
  it("renders flagged, clear and no-data states in English", () => {
    const html = render("en");
    expect(html).toContain("Share count growth: Flagged");
    expect(html).toContain("Low trading volume: Flagged");
    expect(html).toContain("Drop from the 20-day high: Not flagged");
    expect(html).toContain("Interest cover: No data");
    expect(html).toContain("Short interest: No data");
    expect(html).toContain("No short interest source is stored yet.");
    expect(html).toContain("never change it");
  });

  it.each([
    [{ operatingIncome: 100, interestExpense: 10 }, "Interest cover: Not flagged", "covers interest expense 10.0 times"],
    [{ operatingIncome: 10, interestExpense: 100 }, "Interest cover: Flagged", "covers interest expense 0.1 times"],
    [{ operatingIncome: 100, interestExpense: 0 }, "Interest cover: Not flagged", "No interest expense reported."],
  ])("renders interest cover from stored facts %#", (facts, word, detail) => {
    const html = renderToStaticMarkup(<FlagsBlock flags={companyFlags({ bars, shares: [], ...facts, shortInterestPercent: null })} locale="en" m={getMessages("en")} />);
    expect(html).toContain(word);
    expect(html).toContain(detail);
  });

  it("renders the same states in Slovak", () => {
    const html = render("sk");
    expect(html).toContain("Rast počtu akcií: Označené");
    expect(html).toContain("Pokles od 20-dňového maxima: Neoznačené");
    expect(html).toContain("Krytie úrokov: Bez údajov");
    expect(html).toContain("nikdy ho nemenia");
  });

  it("uses informational wording only in both locales", () => {
    const banned = /\b(buy|sell|recommend\w*|opportunit\w*|avoid|should)\b|kúpiť|kúp\b|predať|odporúč\w*|príležitosť|vyhnite/i;
    for (const locale of ["en", "sk"] as const) {
      const strings = JSON.stringify(messages[locale].flags);
      expect(strings, locale).not.toMatch(banned);
      expect(strings, locale).not.toMatch(/[–—]/);
      expect(render(locale)).not.toMatch(banned);
    }
  });
});

describe("ADR-001 line", () => {
  const originalAdvice = process.env.ADVICE_OUTPUT;
  beforeEach(() => { process.env.ADVICE_OUTPUT = "on"; });
  afterEach(() => { if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });

  it.each(["en", "sk"] as const)("renders under the score widget with no advice flag (%s)", (locale) => {
    process.env.ADVICE_OUTPUT = "off";
    const m = getMessages(locale);
    const ruleHits = ruleGroups.flatMap((g) => g.rules).map((rule) => ({ id: rule.id, matched: true }));
    const html = renderToStaticMarkup(<StatusPanel locale={locale} view={statusView({ state: "setup", points: 25, ruleHits, adviceOutput: false })} m={m} adviceOutput={false} asOf={null} methodHref="/m" reasons={[]} />);
    expect(html).toContain(`data-adr-line="">${m.common.disclaimer}</p>`);
    expect(html.indexOf("</ol>")).toBeLessThan(html.indexOf("data-adr-line"));
    expect(html.indexOf("data-adr-line")).toBeLessThan(html.indexOf("</section>"));
  });

  it.each(["en", "sk"] as const)("renders under generated idea text (%s) and stays out of the gated-off card", (locale) => {
    const m = getMessages(locale);
    const on = renderToStaticMarkup(<IdeaCard idea={sampleIdeas[0]} locale={locale} />);
    expect(on).toContain(`data-adr-line="">${m.common.disclaimer}</p>`);
    expect(on.indexOf("data-adr-line")).toBeGreaterThan(on.indexOf(m.ideas.whyItMatters));
    process.env.ADVICE_OUTPUT = "off";
    const off = renderToStaticMarkup(<IdeaCard idea={sampleIdeas[0]} locale={locale} />);
    expect(off).not.toContain("data-adr-line");
    expect(off).not.toContain(m.ideas.whyItMatters);
  });

  it("keeps one shared message key and adds no new legal claim", () => {
    expect(messages.en.common.disclaimer).toBe("Informational screening only. Same rules for every visitor. No personal investment advice.");
    expect(messages.sk.common.disclaimer).toBe("Iba informačný prehľad podľa pravidiel. Rovnaké pravidlá pre každého návštevníka. Nejde o osobné investičné poradenstvo.");
  });
});
