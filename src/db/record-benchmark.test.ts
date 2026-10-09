import { expect, it, vi } from "vitest";
import { buildRecordBenchmark, readRecordBenchmark } from "./record-benchmark";

it("rebases ordered SPY closes in the record range to 100", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [
    { date: "2026-01-06", close: "55" },
    { date: "2026-01-02", close: "50" },
    { date: "2026-01-05", close: "52.5" },
  ] });
  const bars = await readRecordBenchmark({ query } as never, "2026-01-02", "2026-01-06");
  expect(query).toHaveBeenCalledWith(expect.stringContaining("ticker='SPY'"), ["2026-01-02", "2026-01-06"]);
  expect(bars.map((bar) => [bar.date, bar.close])).toEqual([
    ["2026-01-02", 100], ["2026-01-05", 105], ["2026-01-06", 110],
  ]);
});

it("returns no benchmark when SPY has no usable bars", () => {
  expect(buildRecordBenchmark([])).toEqual([]);
  expect(buildRecordBenchmark([{ date: "2026-01-02", close: "0" }])).toEqual([]);
});
