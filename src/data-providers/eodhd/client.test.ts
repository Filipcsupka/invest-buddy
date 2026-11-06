import { describe, expect, it } from "vitest";
import { EodhdClient } from "./client";
import exchanges from "./fixtures/exchanges-list.json";
import symbols from "./fixtures/war-symbols.json";
import bulk from "./fixtures/bulk-eod.json";
import eod from "./fixtures/eod.json";
import fundamentals from "./fixtures/fundamentals.json";
import earnings from "./fixtures/earnings.json";
import news from "./fixtures/news.json";
import form4 from "./fixtures/form4.json";

function fixture(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }); }

describe("EodhdClient", () => {
  it("sends the token and JSON format and reads documented exchange fixtures", async () => {
    const urls: URL[] = [];
    const client = new EodhdClient({ apiKey: "test-token", fetch: async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      return fixture(url.pathname.includes("exchange-symbol-list") ? symbols : exchanges);
    } });
    expect((await client.exchangesList())[0].Code).toBe("US");
    expect((await client.exchangeSymbolList("WAR"))[0].Code).toBe("CDR");
    expect(urls.map((url) => url.pathname)).toEqual(["/api/exchanges-list", "/api/exchange-symbol-list/WAR"]);
    expect(urls.every((url) => url.searchParams.get("api_token") === "test-token" && url.searchParams.get("fmt") === "json")).toBe(true);
    expect(client.getCallCosts()["exchanges-list"]).toBe(1);
    expect(client.getCallCosts()["exchange-symbol-list"]).toBe(1);
  });

  it("uses the documented bulk bar shape and charges 100 plus one per requested symbol", async () => {
    let url = new URL("https://example.test");
    const client = new EodhdClient({ apiKey: "test-token", fetch: async (input) => { url = new URL(String(input)); return fixture(bulk); } });
    expect((await client.eodBulkLastDay("US", { symbols: ["MSFT", "AAPL"], filter: "extended" }))[0].close).toBe(481.63);
    expect(url.searchParams.get("symbols")).toBe("MSFT,AAPL");
    expect(url.searchParams.get("filter")).toBe("extended");
    expect(client.getCallCosts()["eod-bulk-last-day"]).toBe(102);
  });

  it("requests per-symbol split history for one call", async () => {
    let url = new URL("https://example.test");
    const client = new EodhdClient({ apiKey: "test-token", fetch: async (input) => {
      url = new URL(String(input));
      return fixture([{ date: "2024-06-10", split: "10.000000/1.000000" }]);
    } });
    expect(await client.splits("NVDA.US", { from: "2024-06-10", to: "2024-06-10" })).toEqual([{ date: "2024-06-10", split: "10.000000/1.000000" }]);
    expect(url.pathname).toBe("/api/splits/NVDA.US");
    expect(url.searchParams.get("from")).toBe("2024-06-10");
    expect(url.searchParams.get("to")).toBe("2024-06-10");
    expect(client.getCallCosts().splits).toBe(1);
  });

  it("routes the other typed endpoints with their filters and documented call costs", async () => {
    const urls: URL[] = [];
    const responses: unknown[] = [eod, fundamentals, earnings, news, form4];
    const client = new EodhdClient({ apiKey: "test-token", fetch: async (input) => {
      urls.push(new URL(String(input)));
      return fixture(responses[urls.length - 1]);
    } });
    expect((await client.eod("MCD.US", { from: "2024-01-02", to: "2024-01-03" }))[0].close).toBe(297.04);
    expect((await client.fundamentals("AAPL.US", "General")).General?.Code).toBe("AAPL");
    expect((await client.earningsCalendar({ from: "2025-01-01", to: "2025-01-31", symbols: ["AAPL.US"] })).earnings[0].actual).toBe(2.4);
    expect((await client.news({ symbol: "AAPL.US", limit: 1 }))[0].sentiment?.polarity).toBe(0.987);
    expect((await client.form4("AAPL.US", { offset: 0, limit: 20 })).data[0].non_derivative?.[0].transaction_code).toBe("S");
    expect(urls.map((url) => url.pathname)).toEqual([
      "/api/eod/MCD.US", "/api/v1.1/fundamentals/AAPL.US", "/api/calendar/earnings", "/api/news", "/api/sec-filings/AAPL.US/form4",
    ]);
    expect(urls[1].searchParams.get("filter")).toBe("General");
    expect(urls[2].searchParams.get("symbols")).toBe("AAPL.US");
    expect(urls[3].searchParams.get("s")).toBe("AAPL.US");
    expect(urls[4].searchParams.get("page[limit]")).toBe("20");
    expect(client.getCallCosts()).toMatchObject({ eod: 1, fundamentals: 10, "calendar/earnings": 1, news: 5, "sec-filings/form4": 10 });
  });

  it("honors Retry-After and counts both requests as a conservative cost estimate", async () => {
    const waits: number[] = [];
    let attempts = 0;
    const client = new EodhdClient({ apiKey: "test-token", sleep: async (ms) => { waits.push(ms); }, fetch: async () => {
      attempts++;
      return attempts === 1 ? new Response("rate limited", { status: 429, headers: { "Retry-After": "2" } }) : fixture(exchanges);
    } });
    await client.exchangesList();
    expect(waits).toEqual([2000]);
    expect(client.getCallCosts()["exchanges-list"]).toBe(2);
  });

  it("reports exhausted allowance without exposing the token", async () => {
    const client = new EodhdClient({ apiKey: "test-token", fetch: async () => new Response("no allowance", { status: 402 }) });
    await expect(client.exchangesList()).rejects.toThrow("HTTP 402");
    expect(client.getCallCosts()["exchanges-list"]).toBe(0);
  });
});
