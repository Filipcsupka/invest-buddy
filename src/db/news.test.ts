import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeEntities, parseNews, parseSentiments } from "./news";

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/jobs/fixtures/eodhd-flow", name), "utf8")) as unknown;

describe("news parsers", () => {
  it("keeps headline, link, tickers, tags and vendor sentiment, decoding entities", () => {
    const { rows, skipped } = parseNews(fixture("news-tag.json"));
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({ title: "Stocks making the biggest moves premarket: Moderna, Airbnb, Cloudflare, Affirm & more", polarity: 0.676, publishedAt: "2026-11-06T13:05:50.000Z" });
    expect(rows[0].tags).toContain("EARNINGS");
    expect(rows[0].symbols).toContain("MRNA.US");
  });

  it("never keeps the article body and skips rows without an https link, title or date", () => {
    const { rows, skipped } = parseNews([
      { date: "2026-11-06T10:00:00+00:00", title: "T", link: "https://a.example/1", content: "BODY TEXT", symbols: ["aapl.us", 3], tags: null },
      { date: "2026-11-06T10:00:00+00:00", title: "T", link: "http://a.example/2" },
      { date: "nope", title: "T", link: "https://a.example/3" },
      { date: "2026-11-06T10:00:00+00:00", link: "https://a.example/4" },
    ]);
    expect(rows).toEqual([{ link: "https://a.example/1", publishedAt: "2026-11-06T10:00:00.000Z", title: "T", symbols: ["AAPL.US"], tags: [], polarity: null, neg: null, neu: null, pos: null }]);
    expect(JSON.stringify(rows)).not.toContain("BODY");
    expect(skipped).toBe(3);
  });

  it("decodes named and numeric entities only", () => {
    expect(decodeEntities("A &amp; B &#39;x&#x27; &lt;b&gt; &unknown;")).toBe("A & B 'x' <b> &unknown;");
  });

  it("reads the live sentiment shape per symbol and skips bad points", () => {
    const { rows, skipped } = parseSentiments(fixture("sentiments.json"));
    expect(skipped).toBe(0);
    expect(rows.filter((row) => row.symbol === "AAPL.US")).toHaveLength(6);
    expect(rows.find((row) => row.symbol === "BTC-USD.CC")).toEqual({ symbol: "BTC-USD.CC", date: "2026-11-03", score: 0.178, count: 1 });
    expect(parseSentiments({ "X.US": [{ date: "2026-11-01", normalized: 2 }, { date: "bad", normalized: 0.1 }], "Y.US": "x" })).toEqual({ rows: [], skipped: 3 });
  });
});
