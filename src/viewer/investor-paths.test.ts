import { expect, it } from "vitest";
import { canOpenFunds, canSeeStockData, canUseFundData, canUseVendorData, investorPath, type Viewer } from "./viewer";
import { marketSection, marketsViewable } from "@/markets/gate";
import { pathCards } from "@/config/investor-paths";

const viewers: Record<string, Viewer> = {
  anon: { tier: "free", preview: false },
  free: { tier: "free", preview: false, userId: "6", plan: "free" },
  passive: { tier: "free", preview: false, userId: "5", plan: "passive" },
  plus: { tier: "paid", preview: false, userId: "3", plan: "plus" },
  trial: { tier: "paid", preview: false, userId: "4", plan: "trial" },
  owner: { tier: "admin", preview: false, owner: true, userId: "1" },
};
const prod = { EODHD_PRIVATE_USE: "on", MARKETS_VIEWS: "on" };
const licensed = { EODHD_PRIVATE_USE: "off", VENDOR_DISPLAY_LICENSE: "on", MARKETS_VIEWS: "on" };

it.each(["on", "off"] as const)("private use %s: stored stock scores stay Active-only with and without a licence", (privateUse) => {
  for (const licence of ["on", "off"]) {
    const env = { EODHD_PRIVATE_USE: privateUse, VENDOR_DISPLAY_LICENSE: licence, DATA_MODE: "db" };
    for (const name of ["anon", "free", "passive"]) expect(canSeeStockData(viewers[name]!, env), `${name} ${licence}`).toBe(false);
    for (const name of ["plus", "trial", "owner"]) expect(canSeeStockData(viewers[name]!, env), `${name} ${licence}`).toBe(true);
    expect(canUseVendorData(viewers.anon!, env), `anon vendor ${licence}`).toBe(false);
  }
});

it("opens only the fixture sample universe to everyone, and only while private use is off", () => {
  for (const licence of ["on", "off"])
    for (const name of ["anon", "free", "passive"]) {
      expect(canSeeStockData(viewers[name]!, { EODHD_PRIVATE_USE: "off", VENDOR_DISPLAY_LICENSE: licence, DATA_MODE: "fixture" }), name).toBe(true);
      expect(canSeeStockData(viewers[name]!, { EODHD_PRIVATE_USE: "on", VENDOR_DISPLAY_LICENSE: licence, DATA_MODE: "fixture" }), name).toBe(false);
    }
});

// [viewer, stock data, fund data, ETF screen, stock market sections, fund market sections] while EODHD_PRIVATE_USE is on.
it.each([
  ["anon", false, false, false, false, false],
  ["free", false, false, false, false, false],
  ["passive", false, true, true, false, true],
  ["plus", true, true, true, true, true],
  ["trial", true, true, true, true, true],
  ["owner", true, true, true, true, true],
] as const)("private use: %s stocks=%s funds=%s etf=%s stock markets=%s fund markets=%s", (name, stocks, funds, etf, stockMarkets, fundMarkets) => {
  const viewer = viewers[name]!;
  expect(canUseVendorData(viewer, prod)).toBe(stocks);
  expect(canUseFundData(viewer, prod)).toBe(funds);
  expect(canOpenFunds(viewer, prod)).toBe(etf);
  for (const section of ["screener", "news", "congress", "insiders", undefined]) expect(marketsViewable(viewer, prod, marketSection(section)), String(section)).toBe(stockMarkets);
  for (const section of ["indices", "economy", "calendar", "etf"] as const) expect(marketsViewable(viewer, prod, section), section).toBe(fundMarkets);
});

it("a vendor licence opens fund market sections to a free account, never stock sections or the ETF screen", () => {
  expect(marketsViewable(viewers.free!, licensed, "indices")).toBe(true);
  expect(marketsViewable(viewers.free!, licensed, "stocks")).toBe(false);
  expect(marketsViewable(viewers.anon!, licensed, "indices")).toBe(false);
  expect(canOpenFunds(viewers.free!, licensed)).toBe(false);
});

it("a preview or a plan without a session opens nothing paid", () => {
  const preview: Viewer = { tier: "free", preview: true, owner: true, userId: null };
  expect(marketsViewable(preview, prod, "indices")).toBe(false);
  expect(canOpenFunds(preview, prod)).toBe(false);
  const orphan: Viewer = { tier: "paid", preview: false, plan: "passive" };
  expect(canUseFundData(orphan, prod)).toBe(false);
  expect(marketsViewable(orphan, prod, "indices")).toBe(false);
});

it("MARKETS_VIEWS off closes every market section, for the owner too", () => {
  expect(marketsViewable(viewers.owner!, { MARKETS_VIEWS: "off" }, "indices")).toBe(false);
  expect(marketsViewable(viewers.passive!, { MARKETS_VIEWS: "off" }, "indices")).toBe(false);
});

it.each([
  ["anon", "overview"], ["free", "overview"], ["passive", "passive"], ["plus", "active"], ["trial", "active"], ["owner", null],
] as const)("%s is on the %s path", (name, path) => {
  expect(investorPath(viewers[name]!)).toBe(path);
});

it("pathCards marks the own path, open paths and locked paths", () => {
  expect(pathCards({ path: "passive", signedIn: true, access: { active: false, passive: true, overview: true }, overviewHref: "/indices" })).toEqual([
    { id: "active", state: "locked", href: "/pricing#plus", included: false },
    { id: "passive", state: "current", href: "/etf", included: true },
    { id: "overview", state: "open", href: "/indices", included: true },
  ]);
  expect(pathCards({ path: "overview", signedIn: false, access: { active: false, passive: false, overview: true }, overviewHref: "/methodology" }).map((card) => card.state)).toEqual(["locked", "locked", "open"]);
});
