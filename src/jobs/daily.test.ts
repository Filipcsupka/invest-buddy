import { expect, it } from "vitest";
import { fixtureProvider } from "../data/fixtures";
import { MemoryScoreRepository } from "../db/memory";
import { runDaily } from "./daily";

it("runs fixture scoring once for a date", async () => {
  const repository = new MemoryScoreRepository();
  const first = await runDaily(fixtureProvider, repository);
  expect(first.inserted).toBe(true);
  expect(first.instrumentCount).toBeGreaterThan(0);
  const scores = await repository.scores("2025-08-08");
  expect(scores).toHaveLength(first.instrumentCount);
  expect(scores[0].ruleHits.length).toBeGreaterThan(0);
  expect((await runDaily(fixtureProvider, repository)).inserted).toBe(false);
});

it("marks stale database-style prices insufficient and scores fresh prices", async () => {
  const { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } = await import("../data/fixtures");
  const instrument = instruments[0];
  const bars = fixtureBars(instrument.ticker);
  const provider = { instruments: async () => [instrument], bars: async () => bars, fundamentals: async () => fixtureFundamentals(instrument.ticker), macro: async () => fixtureMacro(instrument.ticker) };
  const repository = new MemoryScoreRepository();
  await runDaily(provider, repository, "2025-08-09");
  expect((await repository.scores("2025-08-09"))[0]).toMatchObject({ state: "Insufficient/invalid data", invalidReasons: ["stale_prices"], total: 0 });
  await runDaily(provider, repository, "2025-08-08");
  expect((await repository.scores("2025-08-08"))[0].invalidReasons).not.toContain("stale_prices");
});

it("refreshes the same date when scoring inputs change", async () => {
  const { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } = await import("../data/fixtures");
  const instrument = instruments[0];
  let tailwind = false;
  const provider = {
    instruments: async () => [instrument],
    bars: async () => fixtureBars(instrument.ticker),
    fundamentals: async () => fixtureFundamentals(instrument.ticker),
    macro: async () => ({ ...fixtureMacro(instrument.ticker), dataTailwind: tailwind }),
  };
  const repository = new MemoryScoreRepository();
  expect((await runDaily(provider, repository, "2025-08-08")).inserted).toBe(true);
  const initial = (await repository.scores("2025-08-08"))[0];
  expect((await runDaily(provider, repository, "2025-08-08")).inserted).toBe(false);
  tailwind = true;
  expect((await runDaily(provider, repository, "2025-08-08")).inserted).toBe(true);
  expect((await repository.scores("2025-08-08"))[0].macro).toBeGreaterThan(initial.macro);
});
