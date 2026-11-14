import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const events = vi.fn();
const marketGate = vi.fn();
vi.mock("@/markets/gate", () => ({ assertViewable: () => marketGate() }));
// Admin is the owner only (a session user id in OWNER_USER_IDS); AUTH off no longer makes every visitor admin.
const owner = vi.hoisted(() => ({ on: false }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/viewer/get-viewer")>();
  return { ...real, getViewer: async () => real.resolveViewer(undefined, null, owner.on) };
});
vi.mock("@/db/insiders", () => ({ insiderEvents: () => events() }));
import Insiders from "./page";

const saved = { AUTH: process.env.AUTH, PAYWALL: process.env.PAYWALL, MARKETS_VIEWS: process.env.MARKETS_VIEWS, INSIDERS_PAGE: process.env.INSIDERS_PAGE, EODHD_PRIVATE_USE: process.env.EODHD_PRIVATE_USE };
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const event = (date: string, ticker: string) => ({
  accession: ticker, lineNo: 1, ticker, ownerName: "Owner", reportingOwners: [], isDirector: true, isOfficer: null, isTenPercentOwner: null, isOther: null,
  transactionDate: date, filedAt: date, code: "P", shares: 10, value: 100, secUrl: null,
});
const render = async () => renderToStaticMarkup(await Insiders({ params: Promise.resolve({ locale: "en" }) }));
beforeEach(() => { events.mockResolvedValue([event(day(10), "NEWR"), event(day(400), "OLDR")]); });
afterEach(() => { owner.on = false; events.mockReset(); marketGate.mockReset(); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

it("checks the market gate before reading filings when markets are enabled", async () => {
  process.env.INSIDERS_PAGE = "on";
  process.env.MARKETS_VIEWS = "on";
  marketGate.mockRejectedValue(new Error("404"));
  await expect(render()).rejects.toThrow("404");
  expect(events).not.toHaveBeenCalled();
});

it("keeps the insiders page available to the owner when markets are off", async () => {
  process.env.INSIDERS_PAGE = "on";
  process.env.MARKETS_VIEWS = "off";
  process.env.EODHD_PRIVATE_USE = "off";
  owner.on = true;
  expect(await render()).toContain("NEWR");
  expect(marketGate).not.toHaveBeenCalled();
});

it("shows an admin every event with a Paid badge", async () => {
  delete process.env.AUTH;
  owner.on = true;
  const html = await render();
  expect(html).toContain("NEWR");
  expect(html).toContain("OLDR");
  expect(html).toContain('data-tier-badge="insiders-history"');
});

it("blocks a free viewer before reading insider events", async () => {
  process.env.AUTH = "on";
  process.env.PAYWALL = "on";
  await expect(render()).rejects.toThrow(/404|NOT_FOUND/);
  expect(events).not.toHaveBeenCalled();
});
