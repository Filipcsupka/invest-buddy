// ETF fundamentals are 10 EODHD calls per symbol. Keep the catalog's pending order.
const US_EXCHANGES = new Set(["NYSEARCA", "NASDAQ", "NYSE", "BATS", "AMEX", "IEX"]);
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

export function vendorSymbol(row) {
  if (typeof row.vendorSymbol === "string" && /^[A-Z0-9.-]+\.[A-Z0-9]+$/.test(row.vendorSymbol)) return row.vendorSymbol;
  if (US_EXCHANGES.has(row.exchange) && /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(row.symbol ?? "")) return `${row.symbol}.US`;
  return null;
}

export function mapFundamentals(row, symbol, data) {
  const etf = data?.ETF_Data ?? {}, general = data?.General ?? {};
  const ratio = number(etf.NetExpenseRatio), ongoing = number(etf.Ongoing_Charge);
  const charge = US_EXCHANGES.has(row.exchange) ? ratio !== null ? ratio * 100 : ongoing : ongoing ?? (ratio === null ? null : ratio * 100);
  // EODHD documents NetExpenseRatio as a fraction and Ongoing_Charge as a percent.
  const terPct = charge !== null && charge >= 0 && charge <= 10 ? charge : null;
  const assets = number(etf.TotalAssets);
  const allocation = etf.Asset_Allocation ?? {};
  const classes = Object.entries(allocation).map(([kind, value]) => [
    /^Stock\b/i.test(kind) ? "equity" : /^Bond\b/i.test(kind) ? "bond" : null,
    number(value?.["Net_Assets_%"]),
  ]).filter(([kind, value]) => kind && value !== null);
  const totals = Object.groupBy(classes, ([kind]) => kind);
  const assetClass = Object.entries(totals).find(([, values]) => values.reduce((sum, [, value]) => sum + value, 0) > 50)?.[0] ?? null;
  const regions = Object.entries(etf.World_Regions ?? {}).map(([region, value]) => [region, number(value?.["Equity_%"])]).filter(([, value]) => value !== null).sort((a, b) => b[1] - a[1]);
  const region = regions[0]?.[1] > 50 ? regions[0][0] : null;
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
  for (const { row, symbol } of mapped) {
    const returned = text(cache.get(symbol)?.ETF_Data?.ISIN) ?? text(cache.get(symbol)?.General?.ISIN);
    if (row.isin && returned && row.isin !== returned) throw new Error(`EODHD ISIN mismatch for ${row.listingKey}`);
    const type = text(cache.get(symbol)?.General?.Type);
    if (type && type.toUpperCase() !== "ETF") throw new Error(`EODHD ${symbol}: expected ETF, got ${type}`);
  }
  return { items: mapped.map(({ row, symbol }) => mapFundamentals(row, symbol, cache.get(symbol))), calls };
}
