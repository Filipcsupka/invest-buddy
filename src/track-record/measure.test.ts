import { describe, expect, it } from "vitest";
import { forwardReturn, hitRate, judgeSignal, scoreSignal } from "./measure";

const signal = { asOf: "2026-01-02", tickerClose: 100, spyClose: 200 };
const stock = [{ date: "2026-01-30", close: 140 }, { date: "2026-02-02", close: 110 }, { date: "2026-02-03", close: 150 }];
const spy = [{ date: "2026-02-02", close: 210 }, { date: "2026-02-03", close: 220 }];

describe("forward returns", () => {
  it("waits for the full calendar window and both observed prices", () => {
    expect(forwardReturn(signal, stock, spy, 30, "2026-01-31")).toBeNull();
    expect(forwardReturn(signal, stock, [], 30, "2026-02-03")).toBeNull();
    expect(forwardReturn({ ...signal, spyClose: null }, stock, spy, 30, "2026-02-03")).toBeNull();
  });
  it("uses the first common session on or after the target without looking ahead", () => {
    const measured = forwardReturn(signal, stock, spy, 30, "2026-02-02");
    expect(measured?.date).toBe("2026-02-02");
    expect(measured?.stock).toBeCloseTo(0.1);
    expect(measured?.spy).toBeCloseTo(0.05);
    expect(measured?.excess).toBeCloseTo(0.05);
    expect(forwardReturn(signal, stock, spy, 30, "2026-02-01")).toBeNull();
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
