import { describe, expect, it } from "vitest";
import { forwardReturn, hitRate, judgeSignal, scoreSignal, WINDOWS } from "./measure";

const signal = { asOf: "2026-01-02", tickerClose: 100, spyClose: 200 }; // Friday
const dates: string[] = [];
for (let day = new Date("2026-01-03T00:00:00Z"); dates.length < 60; day.setUTCDate(day.getUTCDate() + 1)) {
  const date = day.toISOString().slice(0, 10);
  if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && date !== "2026-01-19") dates.push(date); // Monday holiday
}
const stock = dates.map((date, index) => ({ date, close: 99 - index / 2 }));
const spy = dates.map((date, index) => ({ date, close: 201 + index }));

describe("forward returns", () => {
  it("waits for each of the four shared trading day windows", () => {
    expect(WINDOWS).toEqual([1, 5, 20, 60]);
    for (const days of WINDOWS) {
      const before = days === 1 ? signal.asOf : dates[days - 2];
      expect(forwardReturn(signal, stock, spy, days, before)).toBeNull();
      const measured = forwardReturn(signal, stock, spy, days, dates[days - 1]);
      expect(measured?.date).toBe(dates[days - 1]);
      expect(measured?.excess).toBeLessThan(0); // losers remain in the record
    }
    expect(dates[0]).toBe("2026-01-05");
    expect(dates[10]).toBe("2026-01-20"); // holiday did not count
  });

  it("skips a missing bar and waits for the next shared close", () => {
    const missingStock = stock.filter((bar) => bar.date !== dates[4]);
    expect(forwardReturn(signal, missingStock, spy, 5, dates[4])).toBeNull();
    expect(forwardReturn(signal, missingStock, spy, 5, dates[5])?.date).toBe(dates[5]);
    expect(forwardReturn(signal, stock, [], 1, dates[0])).toBeNull();
    expect(forwardReturn({ ...signal, spyClose: null }, stock, spy, 1, dates[0])).toBeNull();
  });

  it("counts only measured beat outcomes", () => {
    expect(hitRate([0.1, null, 0, -0.1])).toEqual({ hits: 1, n: 3, rate: 1 / 3 });
    expect(hitRate([null])).toEqual({ hits: 0, n: 0, rate: null });
  });
});

it("records entry and break transitions, plus buy-relevant judge ideas", () => {
  expect(scoreSignal(null, "Setup met (>=18)")).toBe("SETUP");
  expect(scoreSignal("Watch", "Setup met (>=18)")).toBe("SETUP");
  expect(scoreSignal("Setup met (>=18)", "Criteria broken")).toBe("BROKEN");
  expect(scoreSignal("Watch", "Watch")).toBeNull();
  expect(judgeSignal("START_POSITION")).toBe("START_POSITION");
  expect(judgeSignal("ADD")).toBe("ADD");
  expect(judgeSignal("WATCH")).toBeNull();
});
