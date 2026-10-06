import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { RateLimitLockout, assertAllowedUrl, secSlot, type Fetcher } from "../http";
import { requireSecUserAgent } from "../sec-user-agent";
import type { Env } from "./common";

export interface RequestOptions {
  headers?: Record<string, string>;
  /** Per attempt timeout. Default 10 s. */
  timeoutMs?: number;
  /** Hosts a redirect may point to, besides the original host. HTTPS only. */
  redirectHosts?: string[];
  /** Statuses returned as a body instead of an error (openFDA answers 404 for "no matches"). */
  okStatuses?: number[];
  /** Default 4. Use 1 for pings so a 429 fails fast. */
  maxAttempts?: number;
  maxBytes?: number;
}
export interface SourceHttp {
  get(url: string, options?: RequestOptions): Promise<string>;
  post(url: string, body: unknown, options?: RequestOptions): Promise<string>;
  /** Streams the response to a file. Returns the byte count. Never buffers the body. */
  download(url: string, file: string, options?: RequestOptions): Promise<number>;
}
export interface HttpDeps {
  fetcher?: Fetcher;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  env?: Env;
  /** Slot for SEC hosts. Default is the limiter shared with the phase A collectors (5 per second). */
  secSlot?: () => Promise<void>;
  minIntervalMs?: Record<string, number>;
}

/** Every host the A2 sources call, and nothing else. Redirects are checked against it on every hop. */
export const SOURCE_HOSTS: readonly string[] = [
  "www.sec.gov", "data.sec.gov", // getcurrent, frames, 13F, company tickers, EDGAR ping
  "www.globenewswire.com", "api.stlouisfed.org", // rss and fred pings
  "api.openfigi.com", "api.fda.gov", "clinicaltrials.gov", "api.usaspending.gov", "www.federalreserve.gov",
  "api.fiscaldata.treasury.gov", "api.bls.gov", "news.google.com", "api.gdeltproject.org",
  "cdn.cboe.com", "cdn-api.cboe.com", // VIX file redirects from the first to the second
  "www.alphavantage.co",
];

/** Minimum gap between two requests to a host. Documented limits are in the comments. */
export const MIN_INTERVAL_MS: Record<string, number> = {
  "api.openfigi.com": 2500, // 25 requests per minute without a key
  "api.gdeltproject.org": 6000, // "one every 5 seconds"; it still answered 429 about 8 s apart from this network, so 429 waits longer, see RETRY_FLOOR_MS
  "api.bls.gov": 1000, // 25 queries per day on v1; the job sends one
  "news.google.com": 1500,
  "api.fda.gov": 400, // 240 per minute without a key
  "clinicaltrials.gov": 400,
  "api.usaspending.gov": 700,
  "api.fiscaldata.treasury.gov": 300,
  "www.federalreserve.gov": 500,
  "cdn.cboe.com": 500,
  "cdn-api.cboe.com": 500,
  "www.alphavantage.co": 12_000, // free key: 25 requests per day; the source caps itself at 20. Five per minute keeps clear of any burst limit.
};
/** Minimum wait before retrying after 429 or 5xx, when the server sends no Retry-After. */
export const RETRY_FLOOR_MS: Record<string, number> = { "api.gdeltproject.org": 15_000 };
const DEFAULT_INTERVAL_MS = 300;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const MAX_RETRY_WAIT_MS = 60_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isSec = (host: string) => host === "sec.gov" || host.endsWith(".sec.gov");
const safe = (value: string) => { const parsed = new URL(value); parsed.search = ""; parsed.hash = ""; return parsed.toString(); };

export function retryAfterMs(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export function createHttp(deps: HttpDeps = {}): SourceHttp {
  const fetcher = deps.fetcher ?? fetch;
  const wait = deps.wait ?? sleep;
  const now = deps.now ?? (() => Date.now());
  const env = deps.env ?? process.env;
  const intervals = { ...MIN_INTERVAL_MS, ...deps.minIntervalMs };
  const next = new Map<string, number>();
  const chains = new Map<string, Promise<void>>();
  const sec = deps.secSlot ?? (() => secSlot());

  async function slot(host: string) {
    if (isSec(host)) return sec();
    const turn = (chains.get(host) ?? Promise.resolve()).then(async () => {
      const delay = Math.max(0, (next.get(host) ?? 0) - now());
      if (delay) await wait(delay);
      next.set(host, now() + (intervals[host] ?? DEFAULT_INTERVAL_MS));
    });
    chains.set(host, turn.catch(() => {}));
    await turn;
  }

  async function send(method: "GET" | "POST", url: string, body: unknown, options: RequestOptions): Promise<Response> {
    const origin = new URL(url).hostname;
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const target = new URL(current);
      assertAllowedUrl(target, hop === 0 ? "URL" : "redirect", SOURCE_HOSTS);
      if (hop > 0 && target.hostname !== origin && !options.redirectHosts?.includes(target.hostname)) throw new Error(`Redirect to unexpected host ${target.hostname} from ${safe(url)}`);
      const secHost = isSec(target.hostname);
      if (secHost) requireSecUserAgent(env.SEC_USER_AGENT);
      const attempts = options.maxAttempts ?? 4;
      let redirected = false;
      for (let attempt = 0; attempt < attempts; attempt++) {
        await slot(target.hostname);
        const timeoutMs = options.timeoutMs ?? 10_000;
        const response = await fetcher(current, {
          method, redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "User-Agent": secHost ? env.SEC_USER_AGENT! : "InvestBuddy-collector/0.1",
            Accept: "application/json, text/csv, application/xml, text/xml, text/html, */*",
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
          body: method === "POST" ? JSON.stringify(body) : undefined,
        }).catch((error: unknown) => {
          if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error(`Timed out after ${timeoutMs} ms at ${safe(current)}`);
          throw error;
        });
        if (response.status >= 300 && response.status < 400) {
          if (method === "POST") throw new Error(`Unexpected redirect on POST ${safe(current)}`);
          const location = response.headers.get("location");
          if (!location) throw new Error(`Redirect without location: ${safe(current)}`);
          current = new URL(location, current).toString();
          redirected = true;
          break;
        }
        // SEC answers a rate-threshold or bad User-Agent block with 403. Retrying makes it worse.
        if (secHost && response.status === 403) throw new RateLimitLockout(`HTTP 403 at ${safe(current)}`);
        if (response.ok || options.okStatuses?.includes(response.status)) return response;
        if (response.status === 429 || response.status >= 500) {
          if (attempt === attempts - 1) {
            const message = `HTTP ${response.status} at ${safe(current)}`;
            throw response.status === 429 ? new RateLimitLockout(message) : new Error(message);
          }
          const hinted = retryAfterMs(response.headers.get("retry-after"), now());
          await wait(Math.min(hinted ?? Math.max(intervals[target.hostname] ?? DEFAULT_INTERVAL_MS, RETRY_FLOOR_MS[target.hostname] ?? 0, 500 * 2 ** attempt), MAX_RETRY_WAIT_MS));
          continue;
        }
        throw new Error(`HTTP ${response.status} at ${safe(current)}`);
      }
      if (!redirected) break;
    }
    throw new Error(`Too many redirects: ${safe(url)}`);
  }

  async function text(response: Response, url: string, maxBytes: number) {
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxBytes) throw new Error(`Response too large (${length} bytes) at ${safe(url)}`);
    if (!response.body) return response.text();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) { await reader.cancel().catch(() => {}); throw new Error(`Response too large (over ${maxBytes} bytes) at ${safe(url)}`); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  return {
    async get(url, options = {}) { return text(await send("GET", url, undefined, options), url, options.maxBytes ?? DEFAULT_MAX_BYTES); },
    async post(url, body, options = {}) { return text(await send("POST", url, body, options), url, options.maxBytes ?? DEFAULT_MAX_BYTES); },
    async download(url, file, options = {}) {
      const response = await send("GET", url, undefined, { timeoutMs: 600_000, ...options });
      if (!response.body) throw new Error(`Empty body at ${safe(url)}`);
      const limit = options.maxBytes ?? 2 * 1024 ** 3;
      let bytes = 0;
      const counter = new Transform({ transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done(bytes > limit ? new Error(`Download exceeds ${limit} bytes at ${safe(url)}`) : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), counter, createWriteStream(file));
      return bytes;
    },
  };
}

let shared: SourceHttp | undefined;
export const defaultHttp = (): SourceHttp => (shared ??= createHttp());
