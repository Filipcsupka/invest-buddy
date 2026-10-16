import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const events = vi.fn();
vi.mock("@/db/insiders", () => ({ insiderEvents: () => events() }));
import Insiders from "./page";

const saved = { AUTH: process.env.AUTH, PAYWALL: process.env.PAYWALL };
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const event = (date: string, ticker: string) => ({
  accession: ticker, lineNo: 1, ticker, ownerName: "Owner", reportingOwners: [], isDirector: true, isOfficer: null, isTenPercentOwner: null, isOther: null,
  transactionDate: date, filedAt: date, code: "P", shares: 10, value: 100, secUrl: null,
});
const render = async () => renderToStaticMarkup(await Insiders({ params: Promise.resolve({ locale: "en" }) }));
beforeEach(() => { events.mockResolvedValue([event(day(10), "NEWR"), event(day(400), "OLDR")]); });
afterEach(() => { events.mockReset(); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

it("shows an admin every event with a Paid badge", async () => {
  delete process.env.AUTH;
  const html = await render();
  expect(html).toContain("NEWR");
  expect(html).toContain("OLDR");
  expect(html).toContain('data-tier-badge="insiders-history"');
});

it("limits a free viewer to the last 180 days and says so", async () => {
  process.env.AUTH = "on";
  process.env.PAYWALL = "on";
  const html = await render();
  expect(html).toContain("NEWR");
  expect(html).not.toContain("OLDR");
  expect(html).toContain('data-tier-note="insiders-history"');
  expect(html).toContain("180 days");
});
