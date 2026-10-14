import { describe, expect, it, vi } from "vitest";
import { fixtureProvider } from "../data/fixtures";
import { MemoryScoreRepository } from "../db/memory";
import { purgeWebCacheRemote, runDaily } from "./daily";

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
  await runDaily(provider, repository, "2025-08-12");
  expect((await repository.scores("2025-08-12"))[0]).toMatchObject({ state: "Insufficient/invalid data", invalidReasons: ["stale_prices"], total: 0 });
  await runDaily(provider, repository, "2025-08-08");
  expect((await repository.scores("2025-08-08"))[0].invalidReasons).not.toContain("stale_prices");
});

it("accepts Friday prices for a Monday score", async () => {
  const { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } = await import("../data/fixtures");
  const instrument = instruments[0];
  const provider = { instruments: async () => [instrument], bars: async () => fixtureBars(instrument.ticker), fundamentals: async () => fixtureFundamentals(instrument.ticker), macro: async () => fixtureMacro(instrument.ticker) };
  const repository = new MemoryScoreRepository();
  await runDaily(provider, repository, "2025-08-11");
  expect((await repository.scores("2025-08-11"))[0].invalidReasons).not.toContain("stale_prices");
});

it("keeps the 3 calendar day limit exact: day 3 scored, day 4 stale", async () => {
  const { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } = await import("../data/fixtures");
  const instrument = instruments[0];
  const bars = fixtureBars(instrument.ticker);
  const provider = { instruments: async () => [instrument], bars: async () => bars, fundamentals: async () => fixtureFundamentals(instrument.ticker), macro: async () => fixtureMacro(instrument.ticker) };
  const repository = new MemoryScoreRepository();
  const last = bars.at(-1)!.date;
  const plus = (days: number) => new Date(Date.parse(`${last}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  await runDaily(provider, repository, plus(3));
  expect((await repository.scores(plus(3)))[0].invalidReasons).not.toContain("stale_prices");
  await runDaily(provider, repository, plus(4));
  expect((await repository.scores(plus(4)))[0].invalidReasons).toContain("stale_prices");
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

describe("purgeWebCacheRemote", () => {
  it("skips when env is unset", async () => {
    const fetchFn = vi.fn();
    expect(await purgeWebCacheRemote({}, fetchFn as unknown as typeof fetch)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("posts the tags with the bearer token", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await purgeWebCacheRemote({ INGEST_BASE_URL: "http://web:3000/", INGEST_TOKEN: "t" }, fetchFn as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://web:3000/api/revalidate");
    expect(init.body).toBe(JSON.stringify({ tags: ["scores", "portfolio"] }));
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });
  it("never throws on HTTP or network failure", async () => {
    const env = { WEB_BASE_URL: "http://web:3000", INGEST_TOKEN: "t" };
    expect(await purgeWebCacheRemote(env, (async () => new Response("", { status: 500 })) as unknown as typeof fetch)).toBe(false);
    expect(await purgeWebCacheRemote(env, (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBe(false);
  });
});
