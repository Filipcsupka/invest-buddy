import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AreaChip } from "./area-chip";
import { RecordHead } from "@/components/record-parts";
import { AppPageHead } from "@/components/app-page-head";

it("prints the area name next to the dot, so the colour never stands alone", () => {
  expect(renderToStaticMarkup(<AreaChip locale="sk" area="indices" />)).toBe('<span class="kit-area" data-area="indices"><span class="kit-area-dot" aria-hidden="true"></span><span>Indexy</span></span>');
});

it("renders the chip above the title in both page heads", () => {
  for (const html of [renderToStaticMarkup(<RecordHead title="ETF" area={<AreaChip locale="en" area="etf" />} />), renderToStaticMarkup(<AppPageHead title="Stocks" area={<AreaChip locale="en" area="stocks" />} />)]) {
    expect(html.indexOf("kit-area")).toBeGreaterThan(-1);
    expect(html.indexOf("kit-area")).toBeLessThan(html.indexOf("<h1"));
  }
});

it.each([
  ["stocks/page.tsx", "stocks"], ["etf/page.tsx", "etf"], ["etf/fund/[key]/page.tsx", "etf"], ["etf/fund/[key]/[tab]/page.tsx", "etf"], ["etf/track-record/page.tsx", "etf"], ["etf/[symbol]/page.tsx", "etf"],
])("%s heads its page with the %s area chip", (file, area) => {
  expect(readFileSync(`src/app/[locale]/(app)/${file}`, "utf8")).toContain(`<AreaChip locale={locale} area="${area}" />`);
});

it("heads the index list and detail pages with the indices chip", () => {
  expect(readFileSync("src/app/[locale]/(app)/indices/_components/asset-pages.tsx", "utf8").match(/area="indices"/g)).toHaveLength(2);
});
