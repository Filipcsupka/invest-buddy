const BASE_URL = "https://eodhd.com/api";

export type EodhdEndpoint = "exchanges-list" | "exchange-symbol-list" | "eod" | "splits" | "dividends" | "eod-bulk-last-day" | "fundamentals" | "calendar/earnings" | "news" | "sec-filings/form4" | "economic-events" | "sentiments" | "historical-market-cap" | "screener" | "congressional-trades" | "ust/bill-rates" | "ust/long-term-rates" | "ust/yield-rates" | "ust/real-yield-rates" | "macro-indicator";
export type CallCosts = Record<string, number>;

export interface Exchange { Name: string; Code: string; OperatingMIC?: string; Country?: string; Currency?: string; CountryISO2?: string; CountryISO3?: string }
export interface ExchangeSymbol { Code: string; Name: string; Country?: string | null; Exchange?: string | null; Currency?: string | null; Type?: string | null; Isin?: string | null }
export interface EodBar { date: string; open: number | null; high: number | null; low: number | null; close: number | null; adjusted_close?: number | null; volume: number | null }
export interface BulkLastDayBar extends EodBar { code: string; exchange_short_name?: string; prev_close?: number | null; change?: number | null; change_p?: number | null; name?: string; type?: string; MarketCapitalization?: number | null; Beta?: number | null; ema_50d?: number | null; ema_200d?: number | null; hi_250d?: number | null; lo_250d?: number | null; avgvol_14d?: number | null; avgvol_50d?: number | null; avgvol_200d?: number | null }
export interface BulkSplit { code: string; exchange: string; date: string; split: string }
export interface Split { date: string; split: string }
export interface Dividend { date: string; value?: number; unadjustedValue?: number; currency?: string; declarationDate?: string; recordDate?: string; paymentDate?: string; period?: string }
export interface EconomicEvent { type: string; comparison?: string | null; period?: string | null; country: string; date: string; actual?: number | null; previous?: number | null; estimate?: number | null; change?: number | null; change_percentage?: number | null }
export interface SentimentPoint { date: string; count: number; normalized: number }
export type Sentiments = Record<string, SentimentPoint[]>;
export interface MarketCapPoint { date: string; value: number }
export type HistoricalMarketCap = Record<string, MarketCapPoint>;
export interface ScreenerRow { code: string; name?: string; last_day_data_date?: string; adjusted_close?: number | null; refund_1d?: number | null; refund_1d_p?: number | null; refund_5d?: number | null; refund_5d_p?: number | null; exchange?: string; currency_symbol?: string; market_capitalization?: number | null; earnings_share?: number | null; [field: string]: unknown }
export interface ScreenerPage { data: ScreenerRow[]; [field: string]: unknown }
export interface EtfHolding { Code?: string; Exchange?: string; Name?: string; Sector?: string; Industry?: string; Country?: string; Region?: string; "Assets_%"?: number | string | null }
export type EtfHoldings = Record<string, EtfHolding>;
export type EtfDataFilter = "Top_10_Holdings" | "Holdings" | "World_Regions" | "Sector_Weights" | "Asset_Allocation" | "Performance";
export interface CongressionalTrade { chamber?: string; member?: Record<string, unknown>; asset?: Record<string, unknown>; transaction?: Record<string, unknown>; source?: Record<string, unknown> }
export interface CongressionalTradesPage { data: CongressionalTrade[]; meta?: Record<string, unknown>; links?: Record<string, unknown> }
export interface UstRate { date: string; tenor?: string; rate?: number | null; [field: string]: unknown }
export interface UstRatePage { meta?: { total?: number }; data: UstRate[]; links?: Record<string, unknown> }
export interface MacroIndicatorPoint { date?: string; value?: number | null; [field: string]: unknown }
export interface BulkDividend { code: string; exchange: string; date: string; dividend: string; currency?: string | null; declarationDate?: string | null; recordDate?: string | null; paymentDate?: string | null; period?: string | null; unadjustedValue?: string | null }
export interface Fundamentals {
  General?: { Code?: string; Type?: string; Name?: string; Exchange?: string; CurrencyCode?: string; ISIN?: string | null; CUSIP?: string | null; CIK?: string | null; Sector?: string | null; Industry?: string | null };
  Highlights?: { MarketCapitalization?: number | null; EBITDA?: number | null; PERatio?: number | null; EarningsShare?: number | null; DividendYield?: number | null; ProfitMargin?: number | null; RevenueTTM?: number | null };
  SharesStats?: { SharesOutstanding?: number | null; SharesFloat?: number | null; PercentInsiders?: number | null; PercentInstitutions?: number | null; SharesShort?: number | null };
  outstandingShares?: { annual?: Record<string, { date?: string; dateFormatted?: string; sharesMln?: number | null; shares?: number | null }>; quarterly?: Record<string, { date?: string; dateFormatted?: string; sharesMln?: number | null; shares?: number | null }> };
  Earnings?: { History?: Record<string, { reportDate?: string; date?: string; beforeAfterMarket?: string; currency?: string; epsActual?: number | null; epsEstimate?: number | null; epsDifference?: number | null; surprisePercent?: number | null }> };
  Financials?: Record<string, unknown>;
  // UNVERIFIED: ETF fields may differ or be absent for UCITS and other exchanges.
  ETF_Data?: { NetExpenseRatio?: number | string | null; Ongoing_Charge?: number | string | null; Max_Annual_Mgmt_Charge?: number | string | null; TotalAssets?: number | string | null; Holdings?: EtfHoldings; Top_10_Holdings?: EtfHoldings; World_Regions?: Record<string, number | string | null>; Sector_Weights?: Record<string, number | string | null>; Asset_Allocation?: Record<string, number | string | null>; Performance?: Record<string, number | string | null>; Holdings_Count?: number | null };
  [section: string]: unknown;
}
export interface EarningsCalendarItem { code: string; report_date?: string; date?: string; before_after_market?: string; currency?: string; actual?: number | null; estimate?: number | null; difference?: number | null; percent?: number | null }
export interface EarningsCalendar { type?: string; description?: string; symbols?: string; earnings: EarningsCalendarItem[] }
export interface NewsItem { date: string; title: string; content?: string; link?: string; symbols?: string[]; tags?: string[]; sentiment?: { polarity?: number; neg?: number; neu?: number; pos?: number } }
export interface Form4Transaction { reporting_owner_cik?: string; reporting_owner_name?: string; is_director?: boolean; is_officer?: boolean; is_ten_percent_owner?: boolean; officer_title?: string | null; transaction_date?: string; transaction_code?: string; acquired_or_disposed?: string; shares_amount?: number | null; price_per_share?: number | null; shares_owned_after?: number | null; total_value?: number | null; [field: string]: unknown }
export interface Form4Filing { accession_number: string; filed_at?: string; period_of_report?: string; non_derivative?: Form4Transaction[]; derivative?: Form4Transaction[]; footnotes?: unknown[] }
export interface Form4Page { data: Form4Filing[]; meta?: Record<string, unknown>; links?: { next?: string | null } }

export interface EodhdOptions { apiKey?: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; maxRetries?: number }

export class EodhdHttpError extends Error {
  constructor(readonly status: number, endpoint: EodhdEndpoint, detail = "") {
    super(`EODHD ${endpoint}: HTTP ${status}${detail}`);
    this.name = "EodhdHttpError";
  }
}

/** In-process call-cost estimate per endpoint. Retry attempts are counted conservatively. */
export class EodhdClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly counts: CallCosts = { "exchanges-list": 0, "exchange-symbol-list": 0, eod: 0, splits: 0, dividends: 0, "eod-bulk-last-day": 0, fundamentals: 0, "calendar/earnings": 0, news: 0, "sec-filings/form4": 0, "economic-events": 0, sentiments: 0, "historical-market-cap": 0, screener: 0, "congressional-trades": 0, "ust/bill-rates": 0, "ust/long-term-rates": 0, "ust/yield-rates": 0, "ust/real-yield-rates": 0, "macro-indicator": 0 };

  constructor(options: EodhdOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.EODHD_API_KEY ?? "";
    if (!this.apiKey) throw new Error("EODHD_API_KEY is required");
    this.fetcher = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.maxRetries = options.maxRetries ?? 3;
  }

  getCallCosts(): CallCosts { return { ...this.counts }; }

  private async get<T>(endpoint: EodhdEndpoint, path: string, params: Record<string, string | number | boolean | undefined> = {}, cost = 1): Promise<T> {
    const url = new URL(`${BASE_URL}/${path}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    url.searchParams.set("api_token", this.apiKey);
    url.searchParams.set("fmt", "json");
    for (let attempt = 0; ; attempt++) {
      // Count every attempted request conservatively; 429 billing was not observed.
      this.counts[endpoint] += cost;
      let response: Response;
      try { response = await this.fetcher(url, { headers: { Accept: "application/json" } }); }
      catch { throw new Error(`EODHD ${endpoint}: network request failed`); }
      if (response.status === 402) {
        this.counts[endpoint] -= cost; // Documented as rejected before billing.
        throw new EodhdHttpError(402, endpoint, ", API call allowance exhausted or plan access denied");
      }
      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const hinted = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - this.now() : NaN;
        await this.sleep(Number.isFinite(hinted) ? Math.max(0, hinted) : Math.min(30_000, 1000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new EodhdHttpError(response.status, endpoint);
      try { return await response.json() as T; }
      catch { throw new Error(`EODHD ${endpoint}: invalid JSON response`); }
    }
  }

  exchangesList(): Promise<Exchange[]> { return this.get("exchanges-list", "exchanges-list"); }
  exchangeSymbolList(exchange: string, options: { type?: "common_stock" | "preferred_stock" | "stock" | "etf" | "fund"; delisted?: boolean } = {}): Promise<ExchangeSymbol[]> {
    return this.get("exchange-symbol-list", `exchange-symbol-list/${encodeURIComponent(exchange)}`, { type: options.type, delisted: options.delisted ? 1 : undefined });
  }
  eod(symbol: string, options: { from?: string; to?: string; period?: "d" | "w" | "m"; order?: "a" | "d"; filter?: string } = {}): Promise<EodBar[]> {
    return this.get("eod", `eod/${encodeURIComponent(symbol)}`, options);
  }
  splits(symbol: string, options: { from?: string; to?: string } = {}): Promise<Split[]> {
    return this.get("splits", `splits/${encodeURIComponent(symbol)}`, options);
  }
  dividends(symbol: string, options: { from?: string; to?: string } = {}): Promise<Dividend[]> {
    // UNVERIFIED: live payload; optional dates and currency follow the vendor's dividend documentation.
    return this.get("dividends", `div/${encodeURIComponent(symbol)}`, options);
  }
  eodBulkLastDay(exchange: string, options?: { type?: "eod"; date?: string; symbols?: string[]; filter?: "extended" }): Promise<BulkLastDayBar[]>;
  eodBulkLastDay(exchange: string, options: { type: "splits"; date?: string }): Promise<BulkSplit[]>;
  eodBulkLastDay(exchange: string, options: { type: "dividends"; date?: string }): Promise<BulkDividend[]>;
  eodBulkLastDay(exchange: string, options: { type?: "eod" | "splits" | "dividends"; date?: string; symbols?: string[]; filter?: "extended" } = {}): Promise<BulkLastDayBar[] | BulkSplit[] | BulkDividend[]> {
    return this.get("eod-bulk-last-day", `eod-bulk-last-day/${encodeURIComponent(exchange)}`, { ...options, symbols: options.symbols?.join(",") }, 100 + (options.symbols?.length ?? 0));
  }
  fundamentals<T = Fundamentals>(symbol: string, filter?: string): Promise<T> {
    return this.get("fundamentals", `v1.1/fundamentals/${encodeURIComponent(symbol)}`, { filter }, 10);
  }
  etfData<T = EtfHoldings | Record<string, unknown>>(symbol: string, filter: EtfDataFilter): Promise<T> {
    // UNVERIFIED: live shapes for Holdings, World_Regions, Sector_Weights, Asset_Allocation and Performance filters.
    return this.fundamentals<T>(symbol, `ETF_Data::${filter}`);
  }
  economicEvents(options: { country?: string; from?: string; to?: string; limit?: number; offset?: number } = {}): Promise<EconomicEvent[]> { return this.get("economic-events", "economic-events", options); }
  sentiments(symbols: string | string[], options: { from?: string; to?: string } = {}): Promise<Sentiments> {
    // A two-symbol request advanced the account counter by 10 on 2026-11-06; counted as 5 per symbol, as the news docs state.
    const list = Array.isArray(symbols) ? symbols : [symbols];
    if (list.length === 0) throw new Error("EODHD sentiments needs at least one symbol");
    return this.get("sentiments", "sentiments", { s: list.join(","), ...options }, 5 * list.length);
  }
  historicalMarketCap(symbol: string, options: { from?: string; to?: string } = {}): Promise<HistoricalMarketCap> { return this.get("historical-market-cap", `historical-market-cap/${encodeURIComponent(symbol)}`, options, 10); }
  screener(options: { sort?: string; limit?: number; offset?: number; filters?: string; signals?: string } = {}): Promise<ScreenerPage> { return this.get("screener", "screener", options, 5); }
  congressionalTrades(options: { symbol?: string; chamber?: string; type?: string; bioguideId?: string; transactionDateFrom?: string; transactionDateTo?: string; disclosureDateFrom?: string; disclosureDateTo?: string; offset?: number; limit?: number } = {}): Promise<CongressionalTradesPage> {
    if (options.limit !== undefined && (options.limit < 1 || options.limit > 100)) throw new Error("EODHD congressional limit must be 1–100");
    // The vendor reference names the type filter transaction_type; date filters were checked with one live request on 2026-11-06.
    return this.get("congressional-trades", "congressional-trades", { symbol: options.symbol, chamber: options.chamber, transaction_type: options.type,
      bioguide_id: options.bioguideId, transaction_date_from: options.transactionDateFrom, transaction_date_to: options.transactionDateTo,
      disclosure_date_from: options.disclosureDateFrom, disclosure_date_to: options.disclosureDateTo, "page[offset]": options.offset, "page[limit]": options.limit }, 10);
  }
  ustRates(kind: "bill" | "long-term" | "yield" | "real-yield", year?: number): Promise<UstRatePage> {
    // UNVERIFIED: live shapes for bill, long-term and real-yield; yield returned meta/data/links.
    const endpoint = `ust/${kind}-rates` as EodhdEndpoint;
    return this.get(endpoint, endpoint, { "filter[year]": year });
  }
  macroIndicator(country: string, indicator: string): Promise<MacroIndicatorPoint[]> {
    // UNVERIFIED: live response shape; this follows the documented annual point array.
    return this.get("macro-indicator", `macro-indicator/${encodeURIComponent(country)}`, { indicator }, 10);
  }
  earningsCalendar(options: { from?: string; to?: string; symbols?: string[] } = {}): Promise<EarningsCalendar> {
    return this.get("calendar/earnings", "calendar/earnings", { ...options, symbols: options.symbols?.join(",") });
  }
  news(options: { symbol?: string; tag?: string; from?: string; to?: string; limit?: number; offset?: number } = {}): Promise<NewsItem[]> {
    return this.get("news", "news", { s: options.symbol, t: options.tag, from: options.from, to: options.to, limit: options.limit, offset: options.offset }, 5);
  }
  form4(symbol: string, options: { offset?: number; limit?: number } = {}): Promise<Form4Page> {
    if (options.limit !== undefined && (options.limit < 1 || options.limit > 100)) throw new Error("EODHD form4 limit must be 1–100");
    return this.get("sec-filings/form4", `sec-filings/${encodeURIComponent(symbol)}/form4`, { "page[offset]": options.offset, "page[limit]": options.limit }, 10);
  }
}
