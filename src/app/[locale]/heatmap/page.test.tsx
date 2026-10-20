import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";

const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
import Heatmap, * as page from "./page";

const props = (locale: string, metric?: string, sort?: string) => ({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ ...(metric ? { metric } : {}), ...(sort ? { sort } : {}) }) });
afterEach(() => scores.mockReset());

const leaves = (value: unknown): string[] => (typeof value === "string" ? [value] : Object.values(value as object).flatMap(leaves));

describe("sector heat map page", () => {
  it.each([["en", "Sector map", "Colour by"], ["sk", "Mapa sektorov", "Farba podľa"]])("renders sectors with text values in %s", async (locale, title, toggle) => {
    const rows = await scoredUniverse();
    scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
    const html = renderToStaticMarkup(await Heatmap(props(locale)));
    expect(html).toContain(title);
    expect(html).toContain(toggle);
    expect(html).toContain(`href="/${locale}/company/${rows[0].instrument.ticker}"`);
    expect(html).toMatch(/[+−-]\d+[.,]\d\s?%/);
    expect(html).toContain(`href="/${locale}/heatmap?metric=3m"`);
    expect(html).toContain('aria-current="true"');
  });

  it("switches the metric from the query and ignores unknown values", async () => {
    const rows = await scoredUniverse();
    scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
    const rules = renderToStaticMarkup(await Heatmap(props("en", "rules")));
    expect(rules).toContain(getHeatmapMessages("en").noteRules);
    expect(rules).not.toContain("+");
    const bad = renderToStaticMarkup(await Heatmap(props("en", "zzz")));
    expect(bad).toContain(getHeatmapMessages("en").note1m);
  });

  it("keeps value sorting in metric links and gives sector anchors focus targets", async () => {
    const rows = await scoredUniverse();
    scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
    const html = renderToStaticMarkup(await Heatmap(props("en", "3m", "value")));
    expect(html).toContain('href="/en/heatmap?metric=1m&amp;sort=value"');
    expect(html).toContain('aria-current="true"');
    expect(html).toMatch(/href="#sector-[^"]+"/);
    expect(html).toMatch(/id="sector-[^"]+" tabindex="-1"/);
  });

  it.each(["en", "sk"])("shows an empty state in %s", async (locale) => {
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    expect(renderToStaticMarkup(await Heatmap(props(locale)))).toContain(getHeatmapMessages(locale as "en").empty);
  });

  it("uses canonical heat map metadata", async () => {
    const meta = await page.generateMetadata(props("sk"));
    expect(meta.alternates?.canonical).toBe("/sk/heatmap");
  });
});

describe("heat map wording", () => {
  const banned = /\bbuy\b|\bsell\b|recommend|hot stocks?|opportunit|\bbest\b|top picks?|\bkúp\w*|\bpredaj\w*|\bpredať|odporúč(?!anie)\w*|príležitos\w*|najlepš\w*|horúc\w*/i;
  it.each(["en", "sk"] as const)("has no advice wording in %s", (locale) => {
    for (const text of leaves(getHeatmapMessages(locale))) expect(text).not.toMatch(banned);
  });
  it("has the same keys and placeholders in EN and SK", () => {
    const keys = (value: unknown, path = ""): string[] => typeof value === "string" ? [path] : Object.entries(value as object).flatMap(([k, v]) => keys(v, path ? `${path}.${k}` : k));
    expect(keys(getHeatmapMessages("sk")).sort()).toEqual(keys(getHeatmapMessages("en")).sort());
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join();
    const en = leaves(getHeatmapMessages("en")), sk = leaves(getHeatmapMessages("sk"));
    en.forEach((text, i) => expect(ph(sk[i])).toBe(ph(text)));
  });
});
