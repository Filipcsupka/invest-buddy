import { describe, expect, it } from "vitest";
import fixture from "./fixtures/twelvedata-nvda.json";
import { DailyLimitError, parseTimeSeries, SymbolNotFoundError, TwelveDataProvider } from "./twelvedata";

// 2025-08-07 18:00 UTC = 14:00 New York: session of 08-07 still open. 2025-08-08 01:00 UTC = 21:00 New York: closed.
const during = Date.parse("2025-08-07T18:00:00Z");
const after = Date.parse("2025-08-08T01:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function harness(responses: (() => Response | Promise<Response>)[], start = after) {
  let clock = start;
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers as Record<string, string> });
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return next();
  }) as typeof fetch;
  const provider = new TwelveDataProvider({ apiKey: "test-key-123", fetch: fakeFetch, now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; }, backoffMs: 1000 });
  return { provider, calls, sleeps, clock: () => clock };
}

describe("parseTimeSeries", () => {
  it("parses, sorts and dedupes the recorded response", () => {
    const bars = parseTimeSeries(fixture, "NVDA", after);
    expect(bars.map((b) => b.date)).toEqual(["2025-08-04", "2025-08-05", "2025-08-06", "2025-08-07"]);
    expect(bars[0]).toEqual({ date: "2025-08-04", open: 180, high: 183.5, low: 179.2, close: 183.16, volume: 120000000 });
  });
  it("drops today's bar while the US session is open", () => {
    expect(parseTimeSeries(fixture, "NVDA", during).at(-1)?.date).toBe("2025-08-06");
  });
  it("rejects invalid numbers and inconsistent bars", () => {
    const bad = (patch: object) => ({ values: [{ ...fixture.values[0], ...patch }] });
    expect(() => parseTimeSeries(bad({ close: "abc" }), "X", after)).toThrow(/invalid close/);
    expect(() => parseTimeSeries(bad({ open: "0" }), "X", after)).toThrow(/invalid open/);
    expect(() => parseTimeSeries(bad({ volume: "-1" }), "X", after)).toThrow(/invalid volume/);
    expect(() => parseTimeSeries(bad({ high: "100", low: "179.2" }), "X", after)).toThrow();
    expect(() => parseTimeSeries(bad({ datetime: "2025-13-40" }), "X", after)).toThrow(/invalid date/);
    expect(() => parseTimeSeries({ status: "ok" }, "X", after)).toThrow(/no values/);
  });
});

describe("TwelveDataProvider", () => {
  it("sends the key in a header only and requests 260 ascending daily bars", async () => {
    const h = harness([() => json(fixture)]);
    const bars = await h.provider.bars("NVDA");
    expect(bars).toHaveLength(4);
    const url = new URL(h.calls[0].url);
    expect(url.searchParams.get("symbol")).toBe("NVDA");
    expect(url.searchParams.get("outputsize")).toBe("260");
    expect(url.searchParams.get("order")).toBe("ASC");
    expect(h.calls[0].url).not.toContain("test-key-123");
    expect(h.calls[0].headers.Authorization).toBe("apikey test-key-123");
  });
  it("maps SQ to the vendor symbol", async () => {
    const h = harness([() => json(fixture)]);
    await h.provider.bars("SQ");
    expect(new URL(h.calls[0].url).searchParams.get("symbol")).toBe("XYZ");
  });
  it("throttles to 7 requests per minute", async () => {
    const h = harness([() => json(fixture)]);
    for (let i = 0; i < 8; i++) await h.provider.bars("NVDA");
    expect(h.sleeps).toHaveLength(1);
    expect(h.sleeps[0]).toBe(60_000);
    for (let i = 0; i < 7; i++) await h.provider.bars("NVDA");
    expect(h.sleeps.length).toBeGreaterThanOrEqual(2);
  });
  it("retries 429 per-minute errors with backoff and then succeeds", async () => {
    const h = harness([() => json({ code: 429, status: "error", message: "You have run out of API credits for the current minute." }, 429), () => json(fixture)]);
    expect(await h.provider.bars("NVDA")).toHaveLength(4);
    expect(h.calls).toHaveLength(2);
    expect(h.sleeps).toContain(1000);
  });
  it("retries 5xx and gives up after the retry budget", async () => {
    const h = harness([() => json({ message: "boom" }, 503)]);
    await expect(h.provider.bars("NVDA")).rejects.toThrow(/server error 503/);
    expect(h.calls).toHaveLength(4);
  });
  it("stops at once on a daily-limit error without retrying", async () => {
    const h = harness([() => json({ code: 429, status: "error", message: "You have run out of API credits for the day." }, 429)]);
    await expect(h.provider.bars("NVDA")).rejects.toBeInstanceOf(DailyLimitError);
    expect(h.calls).toHaveLength(1);
  });
  it("reports unknown symbols and never leaks the key in errors", async () => {
    const h = harness([() => json({ code: 400, status: "error", message: "symbol not found test-key-123" }, 400)]);
    const error = await h.provider.bars("ZZZZ").catch((e) => e);
    expect(error).toBeInstanceOf(SymbolNotFoundError);
    expect(String(error.message)).not.toContain("test-key-123");
  });
  it("retries a network failure", async () => {
    let n = 0;
    const h = harness([() => { if (n++ === 0) throw new Error("socket"); return json(fixture); }]);
    expect(await h.provider.bars("NVDA")).toHaveLength(4);
  });
});
