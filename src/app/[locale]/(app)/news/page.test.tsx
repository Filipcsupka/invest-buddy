import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const gate = vi.fn();
const feed = vi.fn();
vi.mock("@/markets/gate", () => ({ assertViewable: (source: string) => gate(source) }));
vi.mock("@/db/news", () => ({
  newsFeed: (filter: unknown) => feed(filter),
  topNewsTags: async () => [{ tag: "EARNINGS", count: 3 }],
  sentimentSeries: async () => [],
}));
import News from "./page";
import { SentimentSparklineView } from "./sentiment-sparkline";

const render = async (search: Record<string, string> = {}) => renderToStaticMarkup(await News({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(search) }));

beforeEach(() => {
  gate.mockResolvedValue(undefined);
  feed.mockResolvedValue([{ link: "https://example.com/a", publishedAt: "2026-11-06T13:05:50.000Z", title: "Moves & more", symbols: ["A.US", "B.US", "C.US", "D.US", "E.US", "F.US"], tags: ["EARNINGS"], polarity: 0.676 }]);
});
afterEach(() => { vi.clearAllMocks(); });

it("checks the owner gate before reading data", async () => {
  gate.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
  await expect(render()).rejects.toThrow();
  expect(feed).not.toHaveBeenCalled();
});

it("lists headlines with links, tickers and the vendor score, and passes filters", async () => {
  const html = await render({ ticker: "aapl", tag: "earnings" });
  expect(feed).toHaveBeenCalledWith({ ticker: "AAPL", tag: "EARNINGS" });
  expect(html).toContain('href="https://example.com/a"');
  expect(html).toContain('rel="noopener noreferrer nofollow"');
  expect(html).toContain("Moves &amp; more");
  expect(html).toContain("+2");
  expect(html).toContain("0.68");
  expect(html).toContain("?ticker=AAPL&amp;tag=EARNINGS");
});

it("ignores a malformed ticker", async () => {
  await render({ ticker: "<script>" });
  expect(feed).toHaveBeenCalledWith({ ticker: undefined, tag: undefined });
});

it("draws the sentiment sparkline with an accessible name, or says it is empty", () => {
  const html = renderToStaticMarkup(<SentimentSparklineView locale="en" symbol="AAPL.US" points={[{ date: "2026-11-05", score: 0.67, count: 70 }, { date: "2026-11-06", score: 0.74, count: 46 }]} />);
  expect(html).toContain('role="img"');
  expect(html).toContain("Daily news sentiment for AAPL.US, 2 days");
  expect(html).toContain("Latest 0.74 (46 articles)");
  expect(renderToStaticMarkup(<SentimentSparklineView locale="sk" symbol="X" points={[]} />)).toContain("nie je uložený");
});
