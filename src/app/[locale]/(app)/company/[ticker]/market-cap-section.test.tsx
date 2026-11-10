import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ header: null as string | null, series: [] as { date: string; value: number }[] }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/viewer/get-viewer")>();
  return { ...real, getViewer: async () => real.resolveViewer(undefined, null, auth.header !== null) };
});
vi.mock("@/db/market-cap", () => ({ marketCapSeries: async () => auth.series }));
const { MarketCapSection, ownerMarketCap } = await import("./market-cap-section");

const owner = "owner-session";
afterEach(() => { vi.unstubAllEnvs(); auth.header = null; auth.series = []; });

it("renders nothing for a public visitor or with the flag off", async () => {
  auth.series = [{ date: "2026-10-23", value: 4e12 }, { date: "2026-10-30", value: 5e12 }];
  vi.stubEnv("MARKETS_VIEWS", "on");
  expect(await ownerMarketCap("AAPL")).toBeNull();
  auth.header = owner; vi.stubEnv("MARKETS_VIEWS", "off");
  expect(await ownerMarketCap("AAPL")).toBeNull();
});

it("charts the weekly series in billions for the owner and explains missing EU coverage", async () => {
  vi.stubEnv("MARKETS_VIEWS", "on"); auth.header = owner;
  auth.series = [{ date: "2026-10-23", value: 4e12 }, { date: "2026-10-30", value: 5e12 }];
  const series = await ownerMarketCap("AAPL");
  expect(series).toHaveLength(2);
  const out = renderToStaticMarkup(<MarketCapSection locale="en" ticker="AAPL" series={series!} />);
  expect(out).toContain("Market cap history");
  expect(out).toContain("AAPL weekly market cap: 2 weeks");
  expect(out).toContain("5,000.00");
  auth.series = [];
  const sk = renderToStaticMarkup(<MarketCapSection locale="sk" ticker="SAP" series={(await ownerMarketCap("SAP"))!} />);
  expect(sk).toContain("iba americké tituly");
});
