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
