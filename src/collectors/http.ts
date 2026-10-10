import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireSecUserAgent } from "./sec-user-agent";

export class RateLimitLockout extends Error {}
/** Hosts the phase A collectors talk to. Anything else, including redirect targets, is refused. */
export const ALLOWED_HOSTS: readonly string[] = ["www.sec.gov", "data.sec.gov", "www.globenewswire.com", "www.prnewswire.com", "api.stlouisfed.org"];
/** A response is read up to this many bytes. A 20-F can be 30 MB, the stored body is 200 KB. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let nextSecRequest = 0;
let queue = Promise.resolve();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function secSlot(now = () => Date.now(), wait = sleep): Promise<void> {
  const turn = queue.then(async () => {
    const delay = Math.max(0, nextSecRequest - now());
    if (delay) await wait(delay);
    nextSecRequest = now() + 250;
  });
  queue = turn.catch(() => {});
  await turn;
}

export function resetSecLimiter() { nextSecRequest = 0; queue = Promise.resolve(); }

/** HTTPS, port 443, no credentials, host on the allow-list. Throws with a query-free URL. */
export function assertAllowedUrl(target: URL, kind = "URL", hosts: readonly string[] = ALLOWED_HOSTS): void {
  const shown = `${target.origin}${target.pathname}`;
  if (target.protocol !== "https:") throw new Error(`Insecure ${kind}: ${shown}`);
  if (target.username || target.password || (target.port && target.port !== "443")) throw new Error(`Disallowed ${kind} (port or credentials): ${shown}`);
  if (!hosts.includes(target.hostname.toLowerCase())) throw new Error(`Disallowed host in ${kind}: ${target.hostname}`);
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(bytes + value.length > maxBytes ? value.subarray(0, maxBytes - bytes) : value);
    bytes += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString("utf8");
}

export async function getText(url: string, options: { fetcher?: Fetcher; fixtureDir?: string; wait?: (ms: number) => Promise<void> } = {}): Promise<string> {
  const safe = (value: string) => { const parsed = new URL(value); parsed.search = ""; return parsed.toString(); };
  const fixtureDir = options.fixtureDir ?? process.env.COLLECTOR_FIXTURE_DIR;
  if (fixtureDir) {
    const routes = JSON.parse(await readFile(join(fixtureDir, "routes.json"), "utf8")) as Record<string, string>;
    const path = routes[url] ?? Object.entries(routes).find(([key]) => key.endsWith("*") && url.startsWith(key.slice(0, -1)))?.[1];
    if (!path) throw new Error(`No fixture for ${safe(url)}`);
    return readFile(join(fixtureDir, path), "utf8");
  }
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? sleep;
  let current = url;
  for (let redirect = 0; redirect < 5; redirect++) {
    const target = new URL(current);
    assertAllowedUrl(target, redirect === 0 ? "URL" : "redirect");
    const sec = target.hostname === "sec.gov" || target.hostname.endsWith(".sec.gov");
    if (sec) {
      requireSecUserAgent(process.env.SEC_USER_AGENT);
      await secSlot();
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetcher(current, {
        redirect: "manual", signal: AbortSignal.timeout(10000),
        headers: sec ? { "User-Agent": process.env.SEC_USER_AGENT!, Accept: "application/json, text/html, application/xml, text/xml, */*" } : undefined,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect without location: ${safe(current)}`);
        current = new URL(location, current).toString();
        if (new URL(current).protocol !== "https:") throw new Error(`Insecure redirect: ${safe(current)}`);
        break; // the next hop is checked against the allow-list at the top of the loop, before anything is sent
      }
      if (response.ok) return readCapped(response, MAX_RESPONSE_BYTES);
      // SEC answers a rate-threshold or bad User-Agent block with 403. Retrying or continuing makes it worse.
      if (sec && response.status === 403) throw new RateLimitLockout(`HTTP 403 at ${safe(current)}`);
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 3) {
          const message = `HTTP ${response.status} at ${safe(current)}`;
          if (response.status === 429) throw new RateLimitLockout(message);
          throw new Error(message);
        }
        await wait(500 * 2 ** attempt);
        if (sec) await secSlot();
        continue;
      }
      throw new Error(`HTTP ${response.status} at ${safe(current)}`);
    }
  }
  throw new Error(`Too many redirects: ${safe(url)}`);
}
