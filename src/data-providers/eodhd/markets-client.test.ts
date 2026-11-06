import { describe, expect, it } from "vitest";
import { EodhdClient } from "./client";
import indexBars from "./fixtures/markets/eod-indx.json";
import fxBars from "./fixtures/markets/eod-forex.json";
import cryptoBars from "./fixtures/markets/eod-cc.json";
import holdings from "./fixtures/markets/etf-holdings.json";
import sentiment from "./fixtures/markets/sentiments.json";
import congress from "./fixtures/markets/congress.json";
import yields from "./fixtures/markets/ust-yield.json";
import indexSymbols from "./fixtures/markets/symbols-indx.json";
import fxSymbols from "./fixtures/markets/symbols-forex.json";
import cryptoSymbols from "./fixtures/markets/symbols-cc.json";

describe("market EODHD endpoints", () => {
  it("reads the verified market symbol-list suffixes", async () => {
    const replies = [indexSymbols, fxSymbols, cryptoSymbols];
    let requests = 0;
    const api = new EodhdClient({ apiKey: "fixture", fetch: async (input) => {
      expect(new URL(String(input)).pathname).toBe(`/api/exchange-symbol-list/${["INDX", "FOREX", "CC"][requests]}`);
      return Response.json(replies[requests++]);
    } });
    expect((await api.exchangeSymbolList("INDX"))[0].Code).toBe("GSPC");
    expect((await api.exchangeSymbolList("FOREX"))[0].Code).toBe("EURUSD");
    expect((await api.exchangeSymbolList("CC"))[0].Code).toBe("BTC-USD");
    expect(api.getCallCosts()["exchange-symbol-list"]).toBe(3);
  });
  it("routes each asset-class bar and ETF filter", async () => {
    const urls: URL[] = [];
    const replies = [indexBars, fxBars, cryptoBars, holdings];
    const api = new EodhdClient({ apiKey: "fixture", fetch: async (input) => {
      urls.push(new URL(String(input)));
      return Response.json(replies[urls.length - 1]);
    } });
    expect((await api.eod("GSPC.INDX"))[0].date).toMatch(/^\d{4}-/);
    expect((await api.eod("EURUSD.FOREX"))[0].close).toBeTypeOf("number");
    expect((await api.eod("BTC-USD.CC"))[0].close).toBeTypeOf("number");
    expect(Object.keys(await api.etfData("IWDA.AS", "Top_10_Holdings"))).toHaveLength(2);
    expect(urls.map((url) => url.pathname)).toEqual(["/api/eod/GSPC.INDX", "/api/eod/EURUSD.FOREX", "/api/eod/BTC-USD.CC", "/api/v1.1/fundamentals/IWDA.AS"]);
    expect(urls[3].searchParams.get("filter")).toBe("ETF_Data::Top_10_Holdings");
    expect(api.getCallCosts()).toMatchObject({ eod: 3, fundamentals: 10 });
  });

  it("routes flow and rates with observed response envelopes", async () => {
    const urls: URL[] = [];
    const replies = [sentiment, congress, yields];
    const api = new EodhdClient({ apiKey: "fixture", fetch: async (input) => {
      urls.push(new URL(String(input)));
      return Response.json(replies[urls.length - 1]);
    } });
    expect((await api.sentiments("AAPL.US"))["AAPL.US"][0].normalized).toBeTypeOf("number");
    expect((await api.congressionalTrades({ limit: 2 })).data[0].asset?.symbol).toBe("IBM");
    expect((await api.ustRates("yield", 2026)).data[0].tenor).toBe("1M");
    expect(urls.map((url) => url.pathname)).toEqual(["/api/sentiments", "/api/congressional-trades", "/api/ust/yield-rates"]);
    expect(urls[1].searchParams.get("page[limit]")).toBe("2");
    expect(urls[2].searchParams.get("filter[year]")).toBe("2026");
    expect(api.getCallCosts()).toMatchObject({ sentiments: 1, "congressional-trades": 10, "ust/yield-rates": 1 });
  });

  it("routes remaining collectors and accounts for request costs", async () => {
    const urls: URL[] = [];
    const api = new EodhdClient({ apiKey: "fixture", fetch: async (input) => { urls.push(new URL(String(input))); return Response.json({ data: [] }); } });
    await api.economicEvents({ country: "US", limit: 2 });
    await api.historicalMarketCap("AAPL.US");
    await api.screener({ sort: "market_capitalization.desc", limit: 2 });
    await api.macroIndicator("USA", "gdp_current_usd");
    await api.dividends("SPY.US");
    for (const kind of ["bill", "long-term", "real-yield"] as const) await api.ustRates(kind, 2026);
    expect(urls.map((url) => url.pathname)).toEqual(["/api/economic-events", "/api/historical-market-cap/AAPL.US", "/api/screener", "/api/macro-indicator/USA", "/api/div/SPY.US", "/api/ust/bill-rates", "/api/ust/long-term-rates", "/api/ust/real-yield-rates"]);
    expect(api.getCallCosts()).toMatchObject({ "economic-events": 1, "historical-market-cap": 10, screener: 5, "macro-indicator": 10, dividends: 1 });
  });
});
