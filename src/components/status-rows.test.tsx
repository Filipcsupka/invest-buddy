import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScoreResult } from "@/engine";
import { scoredUniverse } from "@/data/scored";
import { getMessages, type Locale } from "@/i18n";
import { RuleBook, StatusLegend } from "./method";
import { ScreenTable } from "./screen-table";
import { toRow } from "./view-model";

async function row(locale: Locale, catalyst: boolean, noData: string[] = []) {
  const { instrument, result } = (await scoredUniverse())[0];
  const changed: ScoreResult = {
    ...result,
    state: "Watch",
    ruleHits: result.ruleHits.map((hit) => ({ ...hit, matched: hit.id === "catalyst" ? catalyst : !noData.includes(hit.id), unknown: noData.includes(hit.id) })),
  };
  return toRow(locale, { instrument, result: changed });
}
const table = (locale: Locale, item: Awaited<ReturnType<typeof row>>) => renderToStaticMarkup(<ScreenTable locale={locale} rows={[item]} columns={["company", "score", "state"]} caption="Screen" disclaimerId="disclaimer" />);

describe("screen rows", () => {
  it.each(["en", "sk"] as const)("shows percent, core completeness and bonus in %s", async (locale) => {
    const without = table(locale, await row(locale, false));
    const withBonus = table(locale, await row(locale, true));
    expect(without).toContain(locale === "en" ? "100%" : "100 %");
    expect(withBonus).toContain(locale === "en" ? "100%" : "100 %");
    expect(without).toContain(locale === "en" ? "Data from 9 of 9 core rules" : "Údaje pre 9 z 9 hlavných pravidiel");
    expect(without).toContain(locale === "en" ? "Catalyst: Not met" : "Katalyzátor: Nesplnené");
    expect(withBonus).toContain(locale === "en" ? "Catalyst: Met" : "Katalyzátor: Splnené");
    expect(without).not.toContain("/25");
    expect(without).not.toContain('class="col-data"');
  });

  it("uses the derived band and names missing core data", async () => {
    const item = await row("en", false, ["revenue-acceleration", "earnings"]);
    expect(item.state).toBe("watch");
    expect(item.pointsKnown).toBe(7);
    expect(item.percent).toBe(100);
    expect(table("en", item)).toContain("Status Watching, step 4 of 5, 100%, data from 7 of 9 core rules");
  });
});

describe("methodology", () => {
  it.each(["en", "sk"] as const)("labels all ten rules and gives the percentage bands in %s", (locale) => {
    const book = renderToStaticMarkup(<RuleBook locale={locale} definitions />);
    const legend = renderToStaticMarkup(<StatusLegend locale={locale} adviceOutput={false} />);
    const m = getMessages(locale);
    expect(book.match(/class="rule-name"/g)).toHaveLength(10);
    expect(book).toContain(m.status.bonusLabel);
    expect(book).toContain(m.status.coreLabel);
    expect(legend).toContain(m.status.legendMissing);
    expect(legend).toContain(m.status.ranges.setup);
    expect(legend).toContain(m.status.ranges.watch);
    expect(legend).not.toContain("Buy zone");
  });
});
