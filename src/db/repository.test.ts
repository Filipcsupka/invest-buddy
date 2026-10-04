import { describe, expect, it } from "vitest";
import { score } from "../engine";
import { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } from "../data/fixtures";
import { MemoryScoreRepository } from "./memory";
import { stateChange } from "./types";

const instrument = instruments[0];
function result(asOf: string, state: ReturnType<typeof score>["state"]) {
  const base = score({ ticker: instrument.ticker, bars: fixtureBars(instrument.ticker), fundamentals: fixtureFundamentals(instrument.ticker), macro: fixtureMacro(instrument.ticker) });
  return { ...base, asOf, state };
}

describe("state change alerts", () => {
  it("ignores initial and unchanged states, then records a transition", () => {
    const first = result("2025-08-08", "Watch");
    const next = result("2025-08-09", "Setup met (>=18)");
    expect(stateChange(null, first)).toBeNull();
    expect(stateChange(first, { ...next, state: "Watch" })).toBeNull();
    expect(stateChange(first, next)).toMatchObject({ previousState: "Watch", currentState: "Setup met (>=18)" });
  });

  it("stores a date once and compares with the latest earlier score", async () => {
    const repository = new MemoryScoreRepository();
    const first = result("2025-08-08", "Watch");
    const second = result("2025-08-09", "Wait");
    expect((await repository.saveDaily(first.asOf, "fixture", [{ instrument, result: first }])).alerts).toHaveLength(0);
    const saved = await repository.saveDaily(second.asOf, "fixture", [{ instrument, result: second }]);
    expect(saved.alerts).toMatchObject([{ previousState: "Watch", currentState: "Wait" }]);
    expect(await repository.saveDaily(second.asOf, "fixture", [{ instrument, result: second }])).toMatchObject({ inserted: false, alerts: [] });
    expect(await repository.alerts(second.asOf)).toHaveLength(1);
    expect(await repository.scores(second.asOf)).toHaveLength(1);
  });
});

it("replaces a changed daily score and updates its alert without duplication", async () => {
  const repository = new MemoryScoreRepository();
  const first = result("2025-08-08", "Watch");
  const next = result("2025-08-09", "Wait");
  await repository.saveDaily(first.asOf, "fixture", [{ instrument, result: first, fingerprint: "a" }]);
  await repository.saveDaily(next.asOf, "fixture", [{ instrument, result: next, fingerprint: "b" }]);
  expect((await repository.saveDaily(next.asOf, "fixture", [{ instrument, result: next, fingerprint: "b" }])).inserted).toBe(false);
  const changed = { ...next, state: "Setup met (>=18)" as const };
  expect((await repository.saveDaily(next.asOf, "fixture", [{ instrument, result: changed, fingerprint: "c" }])).inserted).toBe(true);
  expect(await repository.alerts(next.asOf)).toMatchObject([{ previousState: "Watch", currentState: "Setup met (>=18)" }]);
  expect(await repository.scores(next.asOf)).toMatchObject([{ state: "Setup met (>=18)" }]);
});
