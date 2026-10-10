import type { OHLCV } from "../engine";
import type { MarketDataProvider } from "./providers";

export class DailyLimitError extends Error {
  constructor(message = "Twelve Data daily request limit reached") { super(message); this.name = "DailyLimitError"; }
}
export class SymbolNotFoundError extends Error {
  constructor(readonly symbol: string, message = `Twelve Data does not know symbol ${symbol}`) { super(message); this.name = "SymbolNotFoundError"; }
}
export class TwelveDataError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "TwelveDataError"; }
}

/** Ticker used in our database mapped to the ticker Twelve Data expects. */
export const DEFAULT_SYMBOL_MAP: Readonly<Record<string, string>> = { SQ: "XYZ" };

export interface TwelveDataOptions {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  maxPerMinute?: number;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  outputSize?: number;
  symbolMap?: Readonly<Record<string, string>>;
  /** Called before every request that is sent, retries included. Throwing (CapReached) stops the call before it is made. */
  reserve?: () => Promise<unknown>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function newYorkParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** True when a bar dated `date` may still be forming: the US cash session closes at 16:00 New York time. */
export function sessionOpenOrFuture(date: string, nowMs: number) {
  const ny = newYorkParts(nowMs);
  return date > ny.date || (date === ny.date && ny.minutes < 16 * 60 + 5);
}

function positive(value: unknown, label: string, symbol: string) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new TwelveDataError(`${symbol}: invalid ${label}`);
  return n;
}

/** Parse and validate a Twelve Data time_series body. Ascending, deduplicated, closed sessions only. */
export function parseTimeSeries(body: unknown, symbol: string, nowMs: number): OHLCV[] {
  const root = body as { values?: unknown } | null;
  if (!root || !Array.isArray(root.values)) throw new TwelveDataError(`${symbol}: response has no values`);
  const byDate = new Map<string, OHLCV>();
  for (const raw of root.values as Record<string, unknown>[]) {
    const datetime = typeof raw?.datetime === "string" ? raw.datetime.slice(0, 10) : "";
    const parsed = Date.parse(`${datetime}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datetime) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== datetime) throw new TwelveDataError(`${symbol}: invalid date`);
    if (sessionOpenOrFuture(datetime, nowMs)) continue;
    const open = positive(raw.open, "open", symbol), high = positive(raw.high, "high", symbol), low = positive(raw.low, "low", symbol), close = positive(raw.close, "close", symbol);
    const volume = typeof raw.volume === "string" && raw.volume.trim() !== "" ? Number(raw.volume) : NaN;
    if (!Number.isFinite(volume) || volume < 0) throw new TwelveDataError(`${symbol}: invalid volume`);
    if (high < low || open > high || open < low || close > high || close < low) throw new TwelveDataError(`${symbol}: inconsistent bar on ${datetime}`);
    byDate.set(datetime, { date: datetime, open, high, low, close, volume });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export class TwelveDataProvider implements MarketDataProvider {
  private readonly stamps: number[] = [];
  private readonly o: Required<Omit<TwelveDataOptions, "apiKey" | "fetch" | "reserve">> & { fetch: typeof fetch };
  private readonly apiKey: string;
  private readonly reserve?: () => Promise<unknown>;
  requests = 0;
  constructor(options: TwelveDataOptions) {
    if (!options.apiKey) throw new Error("TWELVE_DATA_API_KEY is required");
    this.apiKey = options.apiKey;
    this.reserve = options.reserve;
    this.o = {
      fetch: options.fetch ?? globalThis.fetch, now: options.now ?? Date.now, sleep: options.sleep ?? defaultSleep,
      baseUrl: options.baseUrl ?? "https://api.twelvedata.com", maxPerMinute: Math.min(options.maxPerMinute ?? 7, 7), timeoutMs: options.timeoutMs ?? 20_000,
      maxRetries: options.maxRetries ?? 3, backoffMs: options.backoffMs ?? 2_000, outputSize: options.outputSize ?? 260, symbolMap: options.symbolMap ?? DEFAULT_SYMBOL_MAP
    };
  }

  /** Wait until fewer than maxPerMinute requests happened in the last 60 seconds, then claim a slot. */
  private async throttle() {
    for (;;) {
      const now = this.o.now();
      while (this.stamps.length && now - this.stamps[0] >= 60_000) this.stamps.shift();
      if (this.stamps.length < this.o.maxPerMinute) { this.stamps.push(now); return; }
      await this.o.sleep(Math.max(1, 60_000 - (now - this.stamps[0])));
    }
  }

  async bars(ticker: string): Promise<OHLCV[]> {
    const symbol = this.o.symbolMap[ticker] ?? ticker;
    const url = `${this.o.baseUrl}/time_series?${new URLSearchParams({ symbol, interval: "1day", outputsize: String(this.o.outputSize), order: "ASC" })}`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.o.maxRetries; attempt++) {
      if (attempt > 0) await this.o.sleep(this.o.backoffMs * 2 ** (attempt - 1));
      await this.throttle();
      await this.reserve?.();
      this.requests++;
      let response: Response;
      try {
        response = await this.o.fetch(url, { headers: { Authorization: `apikey ${this.apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(this.o.timeoutMs) });
      } catch (error) {
        lastError = new TwelveDataError(`${ticker}: request failed (${error instanceof Error ? error.name : "error"})`);
        continue;
      }
      type Body = { code?: number; status?: string; message?: string; values?: unknown };
      const body: Body | null = await response.json().then((value: unknown) => (value && typeof value === "object" ? value as Body : null), () => null);
      const code = body?.status === "error" && typeof body.code === "number" ? body.code : response.status;
      const message = typeof body?.message === "string" ? body.message.replaceAll(this.apiKey, "***") : "";
      if (code === 429) {
        if (/\b(day|daily)\b/i.test(message)) throw new DailyLimitError(`Twelve Data daily limit reached while fetching ${ticker}`);
        lastError = new TwelveDataError(`${ticker}: rate limited`, 429);
        continue;
      }
      if (code >= 500) { lastError = new TwelveDataError(`${ticker}: server error ${code}`, code); continue; }
      if (code === 400 || code === 404) throw new SymbolNotFoundError(ticker, `${ticker}: symbol not accepted by Twelve Data (${symbol})`);
      if (code === 401 || code === 403) throw new TwelveDataError(`${ticker}: authorization rejected (${code})`, code);
      if (!response.ok || body?.status === "error") throw new TwelveDataError(`${ticker}: unexpected response ${code}`, code);
      return parseTimeSeries(body, ticker, this.o.now());
    }
    throw lastError instanceof Error ? lastError : new TwelveDataError(`${ticker}: failed`);
  }
}
