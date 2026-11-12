import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const gate = vi.fn();
const trades = vi.fn();
vi.mock("@/markets/gate", () => ({ assertViewable: (source: string) => gate(source) }));
vi.mock("@/db/congress", () => ({
  congressTrades: (filter: unknown) => trades(filter),
  congressStats: async () => ({ trades: 12, members: 3, purchases: 5, sales: 7, latest: "2026-11-05" }),
}));
import Congress from "./page";
import { CongressTickerSection } from "./ticker-section";

const trade = { key: "k1", chamber: "house", bioguideId: "S000250", memberName: "Pete Sessions", state: "TX", district: 17, symbol: "DIS", assetDescription: "Walt Disney Company",
  assetType: "Stock", txType: "sale", owner: "Self", txDate: null, disclosureDate: "2026-10-27", amountRange: "$1,001 - $15,000", isLate: true,
  filingUrl: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035563.pdf" };
const render = async (search: Record<string, string> = {}, locale = "en") =>
  renderToStaticMarkup(await Congress({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(search) }));

beforeEach(() => { gate.mockResolvedValue(undefined); trades.mockResolvedValue([trade]); });
afterEach(() => { vi.clearAllMocks(); });

it("checks the owner gate before reading data", async () => {
  gate.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
  await expect(render()).rejects.toThrow();
  expect(trades).not.toHaveBeenCalled();
});

it("shows disclosures with the filed amount range, the late flag and the filing link", async () => {
  const html = await render({ member: "sessions", ticker: "dis", chamber: "house" });
  expect(html).not.toContain("Owner-only view");
  expect(trades).toHaveBeenCalledWith({ ticker: "DIS", member: "sessions", chamber: "house" });
  expect(html).toContain("$1,001 - $15,000");
  expect(html).toContain("Filed late");
  expect(html).toContain('href="https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035563.pdf"');
  expect(html).toContain("Sale");
  expect(html).toContain("—");
  expect(html).not.toMatch(/\b(buy|follow)\b/i);
});

it("ignores an unknown chamber and renders Slovak labels", async () => {
  const html = await render({ chamber: "joint" }, "sk");
  expect(trades).toHaveBeenCalledWith({ ticker: undefined, member: undefined, chamber: undefined });
  expect(html).toContain("Posledné hlásenia");
  expect(html).toContain("Snemovňa");
});

it("renders the ticker section without the asset column", async () => {
  const html = renderToStaticMarkup(await CongressTickerSection({ locale: "en", ticker: "dis.us" }));
  expect(trades).toHaveBeenCalledWith({ ticker: "DIS", limit: 20 });
  expect(html).toContain("Congress trades in DIS");
  expect(html).not.toContain("Walt Disney Company");
});
