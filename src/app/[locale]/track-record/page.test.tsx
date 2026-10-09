import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const history = vi.fn();
const benchmark = vi.fn();
const legacyHistory = vi.fn();
vi.mock("@/db/track-record", () => ({ recordHistory: () => history() }));
vi.mock("@/db/record-benchmark", () => ({ recordBenchmark: (...args: unknown[]) => benchmark(...args) }));
vi.mock("@/data/store", () => ({ scoreHistory: () => legacyHistory(), stale: (date: string | null) => !!date && date < "2026-10-01" }));
vi.mock("@/data/record", () => ({ fixtureBenchmark: () => { throw new Error("Fixture benchmark reached in db mode"); } }));
import TrackRecord from "./page";

const props = { params: Promise.resolve({ locale: "en" }) };
const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; history.mockReset(); benchmark.mockReset(); legacyHistory.mockReset(); });

it("shows an honest empty live record without fixture data", async () => {
  process.env.DATA_MODE = "db";
  benchmark.mockResolvedValue([]);
  history.mockResolvedValue({ snapshotCount: 0, firstDate: null, lastDate: null, signals: [], buySignalCount: 0, hit30: { hits: 0, n: 0, rate: null } });
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
  history.mockResolvedValue({ snapshotCount: 1, firstDate: "2026-01-02", lastDate: "2026-01-02", buySignalCount: 1, hit30: { hits: 1, n: 1, rate: 1 },
    signals: [{ id: 1, ticker: "NVDA", asOf: "2026-01-02", tier: "SETUP", state: "Setup met (>=18)", score: 20,
      windows: { 30: { date: "2026-02-02", stock: 0.1, spy: 0.05, excess: 0.05 }, 90: null, 180: null } }] });
  const html = renderToStaticMarkup(await TrackRecord(props));
  expect(html).toContain("1 snapshot.");
  expect(html).toContain("NVDA");
  expect(html).toContain("vs SPY 5.0%");
  expect(html).toContain("Pending");
  expect(html).not.toContain("synthetic");
  expect(html).toContain("Stale since");
});

it("renders stored SPY history without reaching the fixture benchmark in db mode", async () => {
  process.env.DATA_MODE = "db";
  history.mockResolvedValue({ snapshotCount: 2, firstDate: "2026-01-02", lastDate: "2026-01-05", signals: [], buySignalCount: 0, hit30: { hits: 0, n: 0, rate: null } });
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
