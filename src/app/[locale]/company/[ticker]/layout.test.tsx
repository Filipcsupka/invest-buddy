import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const universe = vi.fn();
const scores = vi.fn();
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe(), latestScores: () => scores() }));

import CompanyLayout from "./layout";

const render = async (ticker: string, locale = "en") => renderToStaticMarkup(await CompanyLayout({ children: <p>body</p>, params: Promise.resolve({ locale, ticker }) }));
const blocks = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"')));

describe("company layout JSON-LD", () => {
  it("emits parseable page, dataset and breadcrumb without rating fields", async () => {
    universe.mockResolvedValue([{ ticker: "ZZZZ", name: "Zed Corp", sector: "x", tier: null, source: "guide" }]);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: "2026-10-09", stale: false });
    const html = await render("zzzz", "sk");
    const data = blocks(html);
    expect(data.map((item) => item["@type"])).toEqual(["WebPage", "Dataset", "BreadcrumbList"]);
    expect(data[0].dateModified).toBe("2026-10-09");
    expect(html).toContain("body");
    expect(html).not.toMatch(/ratingValue|aggregateRating|reviewRating|offers/);
  });
  it("uses the generated description when a score exists, with no rating fields", async () => {
    universe.mockResolvedValue([{ ticker: "ZZZZ", name: "Zed Corp", sector: "x", tier: null, source: "guide" }]);
    const ids = ["revenue-acceleration", "earnings", "accumulation", "above-ma", "uptrend", "green-volume", "dip", "rotation", "macro-data"];
    const ruleHits = ids.map((id, i) => ({ id, label: id, points: 1, matched: i < 5, detail: "" }));
    scores.mockResolvedValue({ rows: [{ instrument: { ticker: "ZZZZ" }, result: { state: "Watch", asOf: "2026-10-09", ruleHits } }], sample: false, lastUpdated: "2026-10-09", stale: false });
    const html = await render("ZZZZ", "en");
    expect(blocks(html)[0].description).toContain("ZZZZ meets 5 of 9 rules as of 9 Oct 2026");
    expect(html).not.toMatch(/ratingValue|aggregateRating|reviewRating|offers/);
  });
  it("emits nothing for an unknown ticker or a failed read", async () => {
    universe.mockResolvedValue([]);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    expect(blocks(await render("NOPE"))).toEqual([]);
    universe.mockRejectedValue(new Error("db"));
    expect(blocks(await render("NOPE"))).toEqual([]);
  });
});
