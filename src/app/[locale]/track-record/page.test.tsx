import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const history = vi.fn();
const benchmark = vi.fn();
const legacyHistory = vi.fn();
vi.mock("@/db/track-record", () => ({ recordHistory: () => history() }));
vi.mock("@/db/record-benchmark", () => ({ recordBenchmark: (...args: unknown[]) => benchmark(...args) }));
vi.mock("@/data/store", () => ({ instrumentUniverse: async () => new Array(36).fill({}), scoreHistory: () => legacyHistory(), stale: (date: string | null) => !!date && date < "2026-10-01" }));
vi.mock("@/data/record", () => ({ fixtureBenchmark: () => { throw new Error("Fixture benchmark reached in db mode"); } }));
import TrackRecord from "./page";

const props = { params: Promise.resolve({ locale: "en" }) };
const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; history.mockReset(); benchmark.mockReset(); legacyHistory.mockReset(); });

it("shows an honest empty live record without fixture data", async () => {
  process.env.DATA_MODE = "db";
  benchmark.mockResolvedValue([]);
  history.mockResolvedValue({ snapshotCount: 0, firstDate: null, lastDate: null, signals: [], buySignalCount: 0, worst: [], hit20: { hits: 0, n: 0, rate: null } });
  const html = renderToStaticMarkup(await TrackRecord(props));
  expect(html).toContain("No real snapshots or signals");
  expect(html).toContain("0 snapshots");
  expect(html).not.toContain("Synthetic benchmark");
  expect(html).not.toContain("Three dated snapshots");
  expect(legacyHistory).not.toHaveBeenCalled();
  expect(html).toContain("No data yet");
});

it("shows measured returns and pending windows from stored signals", async () => {
  process.env.DATA_MODE = "db";
  benchmark.mockResolvedValue([]);
  history.mockResolvedValue({ snapshotCount: 1, firstDate: "2026-01-02", lastDate: "2026-01-02", buySignalCount: 1, worst: [{ id: 2, ticker: "AMD", asOf: "2026-01-02", window: 1, stock: -0.1, excess: -0.15 }], hit20: { hits: 1, n: 1, rate: 1 },
    signals: [{ id: 1, ticker: "NVDA", asOf: "2026-01-02", tier: "SETUP", state: "Setup met (>=18)", score: 20,
      windows: { 1: { date: "2026-01-05", stock: 0.1, spy: 0.05, excess: 0.05 }, 5: null, 20: null, 60: null } },
    { id: 2, ticker: "AMD", asOf: "2026-01-02", tier: "SETUP", state: "Setup met (>=18)", score: 19,
      windows: { 1: { date: "2026-01-05", stock: -0.1, spy: 0.05, excess: -0.15 }, 5: null, 20: null, 60: null } }] });
  const html = renderToStaticMarkup(await TrackRecord(props));
  expect(html).toContain("1 snapshot.");
  expect(html).toContain("NVDA");
  expect(html).toContain("vs SPY 5.0%");
  expect(html).toContain("vs SPY -15.0%");
  expect(html).toContain("1 trading day");
  expect(html).toContain("60 trading days");
  expect(html).toContain("Pending");
  expect(html).not.toContain("synthetic");
  expect(html).toContain("Stale since");
});

it("renders stored SPY history without reaching the fixture benchmark in db mode", async () => {
  process.env.DATA_MODE = "db";
  history.mockResolvedValue({ snapshotCount: 2, firstDate: "2026-01-02", lastDate: "2026-01-05", signals: [], buySignalCount: 0, worst: [], hit20: { hits: 0, n: 0, rate: null } });
  benchmark.mockResolvedValue([
    { date: "2026-01-02", open: 100, high: 100, low: 100, close: 100, volume: 0 },
    { date: "2026-01-05", open: 102, high: 102, low: 102, close: 102, volume: 0 },
  ]);
  const html = renderToStaticMarkup(await TrackRecord(props));
  expect(benchmark).toHaveBeenCalledWith("2026-01-02", "2026-01-05");
  expect(html).toContain("SPY");
  expect(html).toContain("line-close");
  expect(html).not.toContain("Synthetic benchmark");
});

it("shows the excluded-period line, n and the weakest outcomes", async () => {
  process.env.DATA_MODE = "db";
  benchmark.mockResolvedValue([]);
  history.mockResolvedValue({ snapshotCount: 1, firstDate: "2026-10-06", lastDate: "2026-10-06", buySignalCount: 2, hit20: { hits: 1, n: 2, rate: 0.5 },
    worst: [{ id: 2, ticker: "AMD", asOf: "2026-10-06", window: 1, stock: -0.1, excess: -0.15 }],
    signals: [] });
  const html = renderToStaticMarkup(await TrackRecord(props));
  expect(html).toContain("not included");
  expect(html).toContain("log started on 6 Oct 2026");
  expect(html).toContain("across 2 measured");
  expect(html).toContain("Weakest outcomes");
  expect(html).toContain("AMD");
  expect(html).toContain("vs SPY -15.0%");
});

it("lists a losing month as a plain row, with method line and backtest note", async () => {
  process.env.DATA_MODE = "db";
  const win = { stock: 0.06, spy: 0.02, excess: 0.04 };
  const loss = { stock: -0.05, spy: 0.01, excess: -0.06 };
  const signal = (id: number, ticker: string, asOf: string, w20: typeof win) => ({ id, ticker, asOf, tier: "SETUP", state: "Setup met (>=18)", score: 19, windows: { 1: null, 5: null, 20: w20, 60: null } });
  history.mockResolvedValue({ snapshotCount: 3, firstDate: "2026-10-06", lastDate: "2026-11-10", buySignalCount: 3, worst: [], hit20: { hits: 1, n: 3, rate: 1 / 3 },
    signals: [signal(3, "AMD", "2026-11-04", loss), signal(2, "MSFT", "2026-10-20", loss), signal(1, "NVDA", "2026-10-07", win)] });
  benchmark.mockResolvedValue([
    { date: "2026-10-06", open: 100, high: 100, low: 100, close: 100, volume: 0 },
    { date: "2026-10-30", open: 103, high: 103, low: 103, close: 103, volume: 0 },
    { date: "2026-11-10", open: 106, high: 106, low: 106, close: 106, volume: 0 },
  ]);
  const html = renderToStaticMarkup(await TrackRecord(props));
  expect(html).toContain("By period");
  expect(html).toContain("November 2026");
  expect(html).toContain("October 2026");
  expect(html).toContain("-6.0%");
  expect(html).toContain("SPY, 6 Oct 2026 to 10 Nov 2026");
  expect(html).toContain("Universe: 36 tickers. Log start: 6 Oct 2026. Signals: 3. No costs or slippage are included.");
  expect(html).toContain("Backtest: not shown");
  expect(html).not.toMatch(/loss|losing period|warning/i);
});

it("shows the same figures in Slovak", async () => {
  process.env.DATA_MODE = "db";
  history.mockResolvedValue({ snapshotCount: 1, firstDate: "2026-10-06", lastDate: "2026-10-20", buySignalCount: 1, worst: [], hit20: { hits: 0, n: 1, rate: 0 },
    signals: [{ id: 1, ticker: "AMD", asOf: "2026-10-07", tier: "SETUP", state: "Setup met (>=18)", score: 19, windows: { 1: null, 5: null, 20: { stock: -0.05, spy: 0.01, excess: -0.06 }, 60: null } }] });
  benchmark.mockResolvedValue([]);
  const html = renderToStaticMarkup(await TrackRecord({ params: Promise.resolve({ locale: "sk" }) }));
  expect(html).toContain("Podľa obdobia");
  expect(html).toContain("Zoznam: 36 tickerov.");
  expect(html).toContain("Bez nákladov a preklzu.");
  expect(html).toContain("Spätný test: nezobrazený");
  expect(html).toContain("-6,0");
});

it("shows the pending count for a period with no measured window", async () => {
  process.env.DATA_MODE = "db";
  const signal = (id: number, ticker: string, asOf: string) => ({ id, ticker, asOf, tier: "SETUP", state: "Setup met (>=18)", score: 19, windows: { 1: null, 5: null, 20: null, 60: null } });
  history.mockResolvedValue({ snapshotCount: 2, firstDate: "2026-10-06", lastDate: "2026-11-10", buySignalCount: 2, worst: [], hit20: { hits: 0, n: 0, rate: null },
    signals: [signal(2, "AMD", "2026-11-04"), signal(1, "NVDA", "2026-11-05")] });
  benchmark.mockResolvedValue([]);
  const html = renderToStaticMarkup(await TrackRecord(props));
  expect(html).toContain("<td>0<span class=\"muted small\"> (2 pending)</span></td>");
});
