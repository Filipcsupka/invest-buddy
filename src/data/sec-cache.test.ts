import { afterEach, expect, it, vi } from "vitest";
import fixture from "./fixtures/sec-companyfacts.json";
import { secCacheSize, secRevenue } from "./sec";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("keeps only the SEC ticker index in memory, not each companyfacts body", async () => {
  vi.stubEnv("SEC_USER_AGENT", "Test Contact test@example.com");
  const tickers = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [String(i), { ticker: `T${i}`, cik_str: 1000 + i }]));
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(url); return new Response(JSON.stringify(url.includes("company_tickers") ? tickers : fixture), { status: 200 }); }));
  for (let i = 0; i < 5; i++) await secRevenue(`T${i}`, "2026-11-06");
  expect(urls.filter((url) => url.includes("company_tickers"))).toHaveLength(1);
  expect(urls.filter((url) => url.includes("companyfacts"))).toHaveLength(5);
  expect(secCacheSize()).toBe(1);
}, 20_000);
