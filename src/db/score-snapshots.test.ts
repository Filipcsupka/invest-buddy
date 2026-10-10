import { describe, expect, it } from "vitest";
import { fixtureBars, fixtureFundamentals, fixtureMacro, fixtureProvider, instruments } from "../data/fixtures";
import { runDaily } from "../jobs/daily";
import { MemoryScoreRepository } from "./memory";
import { replaySnapshot } from "./score-replay";
import { barsHash } from "./score-snapshots";

const nvda = instruments.find((i) => i.ticker === "NVDA")!;
const provider = (fundamentals = fixtureFundamentals("NVDA")) => ({ instruments: async () => [nvda], bars: async () => fixtureBars("NVDA"), fundamentals: async () => fundamentals, macro: async () => fixtureMacro("NVDA") });

describe("score input snapshots", () => {
  it("writes one snapshot for two runs with the same inputs and a second when an input changes", async () => {
    const repository = new MemoryScoreRepository();
    await runDaily(provider(), repository, "2025-08-08");
    await runDaily(provider(), repository, "2025-08-08");
    expect(repository.snapshots).toHaveLength(1);
    const changed = { ...fixtureFundamentals("NVDA"), guidanceRaised: !fixtureFundamentals("NVDA").guidanceRaised };
    await runDaily(provider(changed), repository, "2025-08-08");
    expect(repository.snapshots).toHaveLength(2);
    expect(new Set(repository.snapshots.map((s) => s.inputsFingerprint)).size).toBe(2);
  });

  it("replays the stored NVDA snapshot to the stored total, state and rule hits", async () => {
    const repository = new MemoryScoreRepository();
    await runDaily(provider(), repository, "2025-08-08");
    const [snapshot] = repository.snapshots;
    const [stored] = await repository.scores("2025-08-08");
    expect(snapshot).toMatchObject({ ticker: "NVDA", asOf: "2025-08-08", rulesVersion: expect.any(String), barLastDate: "2025-08-08" });
    expect(snapshot.barsHash).toBe(barsHash(fixtureBars("NVDA"), "2025-08-08"));
    const report = replaySnapshot(snapshot, fixtureBars("NVDA"), stored);
    expect(report).toMatchObject({ ok: true, barsMatch: true, differences: [] });
    expect(report.replayed.total).toBe(stored.total);
    expect(report.replayed.ruleHits.length).toBeGreaterThan(0);
  });

  it("flags changed bars and changed stored scores", async () => {
    const repository = new MemoryScoreRepository();
    await runDaily(provider(), repository, "2025-08-08");
    const [snapshot] = repository.snapshots;
    const [stored] = await repository.scores("2025-08-08");
    const bars = fixtureBars("NVDA").map((bar, i, all) => (i === all.length - 1 ? { ...bar, close: bar.close * 1.1 } : bar));
    expect(replaySnapshot(snapshot, bars, stored).barsMatch).toBe(false);
    expect(replaySnapshot(snapshot, fixtureBars("NVDA"), { ...stored, total: stored.total + 1 }).differences[0]).toMatch(/total/);
  });

  it("covers the whole fixture universe", async () => {
    const repository = new MemoryScoreRepository();
    const outcome = await runDaily(fixtureProvider, repository);
    expect(repository.snapshots).toHaveLength(outcome.instrumentCount);
  });
});
