// ETF fundamentals are 10 EODHD calls per symbol. Keep the catalog's pending order.
const US_EXCHANGES = new Set(["NYSEARCA", "NASDAQ", "NYSE", "BATS", "AMEX", "IEX"]);
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

function expensePercent(etf) {
  const ratio = number(etf.NetExpenseRatio), ongoing = number(etf.Ongoing_Charge);
  const ratioPct = ratio !== null && ratio >= 0 && ratio <= 0.1 ? ratio * 100 : null;
  const ongoingPct = ongoing !== null && ongoing >= 0 && ongoing <= 10 ? ongoing : null;
  if (ratio !== null && ongoing !== null) return ratioPct !== null && ongoingPct !== null && Math.abs(ratioPct - ongoingPct) <= 0.01 ? ongoingPct : null;
  // A lone ratio of 1–10% may be a fraction or an already-percent value.
  if (ratio !== null) return ratio < 0.01 ? ratioPct : null;
  // A tiny lone ongoing charge may also be a fraction sent in a percent field.
  return ongoingPct === 0 || (ongoingPct !== null && ongoingPct >= 0.01) ? ongoingPct : null;
}

export function vendorSymbol(row) {
  if (typeof row.vendorSymbol === "string" && /^[A-Z0-9.-]+\.[A-Z0-9]+$/.test(row.vendorSymbol)) return row.vendorSymbol;
  if (US_EXCHANGES.has(row.exchange) && /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(row.symbol ?? "")) return `${row.symbol}.US`;
  return null;
}

export function mapFundamentals(row, symbol, data) {
  const etf = data?.ETF_Data ?? {}, general = data?.General ?? {};
  const terPct = expensePercent(etf);
  const assets = number(etf.TotalAssets);
  const allocation = etf.Asset_Allocation ?? {};
  const classes = Object.entries(allocation).map(([kind, value]) => [
    /^Stock\b/i.test(kind) ? "equity" : /^Bond\b/i.test(kind) ? "bond" : null,
    number(value?.["Net_Assets_%"]),
  ]).filter(([kind, value]) => kind && value !== null);
  const totals = Object.groupBy(classes, ([kind]) => kind);
  const assetClass = Object.entries(totals).find(([, values]) => values.reduce((sum, [, value]) => sum + value, 0) > 50)?.[0] ?? null;
  const region = null;
  const count = number(etf.Holdings_Count);
  return {
    listingKey: row.listingKey, isin: [etf.ISIN, general.ISIN, row.isin].map(text).find((value) => value && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) ?? null,
    issuer: text(etf.Company_Name), assetClass, region, theme: null,
    trackedIndex: text(etf.Index_Name), terPct,
    aumUsdM: US_EXCHANGES.has(row.exchange) && general.CurrencyCode === "USD" && assets !== null && assets >= 0 ? assets / 1_000_000 : null,
    domicile: text(etf.Domicile), replication: null, distribution: null, ucits: null,
    sourceUrl: symbol ? `https://eodhd.com/api/v1.1/fundamentals/${encodeURIComponent(symbol)}` : null,
    source: "eodhd", holdingsCount: count !== null && Number.isInteger(count) && count >= 0 ? count : null,
  };
}

export async function enrichEodhd(items, { apiKey, request = fetch, dryRun = false, log = console.log, cache = new Map() } = {}) {
  const mapped = items.map((row) => ({ row, symbol: vendorSymbol(row) }));
  const unique = [...new Set(mapped.map(({ symbol }) => symbol).filter((symbol) => symbol && !cache.has(symbol)))];
  const calls = unique.length * 10;
  if (dryRun) { log(`etf-enrich eodhd: ${items.length} rows, ${unique.length} unique symbols, ${calls} estimated calls (dry run)`); return { items: [], calls }; }
  if (!apiKey) throw new Error("EODHD_API_KEY is required");
  for (const symbol of unique) {
    const url = new URL(`https://eodhd.com/api/v1.1/fundamentals/${encodeURIComponent(symbol)}`);
    url.searchParams.set("api_token", apiKey); url.searchParams.set("fmt", "json");
    const response = await request(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
    if (response.status === 402) throw new Error("EODHD fundamentals: HTTP 402, allowance exhausted or plan access denied");
    if (!response.ok) throw new Error(`EODHD fundamentals ${symbol}: HTTP ${response.status}`);
    cache.set(symbol, await response.json());
  }
  const results = mapped.map(({ row, symbol }) => {
    const returned = text(cache.get(symbol)?.ETF_Data?.ISIN) ?? text(cache.get(symbol)?.General?.ISIN);
    const type = text(cache.get(symbol)?.General?.Type);
    if (row.isin && returned && row.isin !== returned) {
      log(`etf-enrich ${row.listingKey}: vendor ISIN mismatch; marked incomplete`);
      return mapFundamentals(row, symbol, undefined);
    }
    if (type && type.toUpperCase() !== "ETF") {
      log(`etf-enrich ${row.listingKey}: vendor type ${type}; marked incomplete`);
      return mapFundamentals(row, symbol, undefined);
    }
    return mapFundamentals(row, symbol, cache.get(symbol));
  });
  return { items: results, calls };
}
