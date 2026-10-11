import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { secSlot } from "../collectors/http";

/** Limits of the verifier's fetcher (design doc, Security). */
export const GUARD_LIMITS = {
  maxRedirects: 3,
  timeoutMs: 10_000,
  maxBytes: 5 * 1024 * 1024,
  /** Pause between two requests to the same host. sec.gov uses the shared 250 ms SEC slot instead. */
  hostDelayMs: 1000,
  maxRobotsBytes: 512 * 1024,
} as const;
export const ALLOWED_CONTENT_TYPES: readonly string[] = ["text/html", "application/xhtml+xml", "text/plain", "application/pdf"];
export const USER_AGENT = "InvestBuddy-source-verifier/1.0 (+mailto:tradeops@filipcsupka.online)";

/** Thrown when our own guard refuses a URL or an address. Maps to status `blocked`. */
export class UrlBlocked extends Error {
  constructor(message: string) { super(message); this.name = "UrlBlocked"; }
}

export type Resolver = (hostname: string) => Promise<string[]>;
export const dnsResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

const v4ToNumber = (ip: string) => ip.split(".").reduce((total, part) => total * 256 + Number(part), 0);
const V4_BLOCKS: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
function privateV4(ip: string): boolean {
  const value = v4ToNumber(ip);
  return V4_BLOCKS.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(v4ToNumber(base) / 2 ** (32 - bits)));
}

/** Expands an IPv6 literal to 8 hextets, or null when malformed. A trailing dotted IPv4 becomes two hextets. */
function expandV6(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0];
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]) !== 4) return null;
    const n = v4ToNumber(dotted[2]);
    text = `${dotted[1]}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast, reserved and unspecified addresses, IPv4 and IPv6. Unparseable input counts as private. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const kind = isIP(ip);
  if (kind === 4) return privateV4(ip);
  if (kind !== 6) return true;
  const g = expandV6(ip);
  if (!g) return true;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    // ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible), :: and ::1
    return privateV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`) || g.slice(0, 7).every((x) => x === 0);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`); // NAT64
  if (g[0] === 0x2002) return privateV4(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`); // 6to4
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00 || (g[0] === 0x2001 && g[1] === 0x0db8);
}

/** `.svc` and `.cluster.local` are the cluster service names. The pod and service ranges sit inside 10/8, 172.16/12 and 100.64/10, which are blocked. */
const BLOCKED_SUFFIXES = [".svc", ".cluster.local", ".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".localdomain", ".home.arpa"];

/** Query-free text for logs and reasons. */
export function safeUrl(value: string | URL): string {
  try { const u = new URL(value); return `${u.origin}${u.pathname}`; } catch { return "invalid-url"; }
}

export interface CheckedUrl { url: URL; addresses: string[] }

/**
 * SSRF guard for one URL: https only, port 443, no credentials, a DNS name with a dot (no IP literal, `localhost`, `.svc`,
 * `.cluster.local` or single-label name), and every address the name resolves to is public. Throws UrlBlocked.
 * Returns the checked addresses; the request connects to one of them, so a changed DNS answer is not used.
 * Runs before each hop, so a redirect to a private target is never requested.
 */
export async function assertPublicUrl(raw: string, resolve: Resolver = dnsResolver): Promise<CheckedUrl> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UrlBlocked("invalid URL"); }
  if (url.protocol !== "https:") throw new UrlBlocked(`only https is allowed: ${safeUrl(url)}`);
  if (url.username || url.password) throw new UrlBlocked(`credentials in URL: ${safeUrl(url)}`);
  if (url.port && url.port !== "443") throw new UrlBlocked(`port ${url.port} is not allowed: ${safeUrl(url)}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new UrlBlocked("empty host");
  if (isIP(host.replace(/^\[|\]$/g, "")) || /^[\d.]+$/.test(host) || host.startsWith("[")) throw new UrlBlocked(`IP address hosts are not allowed: ${host}`);
  if (host === "localhost" || host === "svc" || !host.includes(".") || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) throw new UrlBlocked(`internal host name: ${host}`);
  let addresses: string[];
  try { addresses = await resolve(host); } catch { throw new Error(`DNS lookup failed for ${host}`); }
  if (!addresses.length) throw new Error(`DNS lookup returned no address for ${host}`);
  const bad = addresses.find(isPrivateAddress);
  if (bad) throw new UrlBlocked(`${host} resolves to a private or reserved address`);
  return { url, addresses };
}

/** Media type without parameters, lower case. */
export const mediaType = (header: string | null) => (header ?? "").split(";")[0].trim().toLowerCase();
export const contentTypeAllowed = (header: string | null) => ALLOWED_CONTENT_TYPES.includes(mediaType(header));

export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const charset = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType ?? "")?.[1];
  try { return new TextDecoder(charset ?? "utf-8").decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); }
}

/** Pieces of the request the transport needs. It must connect to `address` and send the Host and SNI of `url`. */
export interface TransportRequest { url: URL; address: string; headers: Record<string, string>; timeoutMs: number }
export type Transport = (req: TransportRequest) => Promise<Response>;

/** Default transport: node https with the connection pinned to the address the guard checked. */
export const pinnedTransport: Transport = ({ url, address, headers, timeoutMs }) => new Promise((resolve, reject) => {
  const family = isIP(address) === 6 ? 6 : 4;
  const req = request({
    host: url.hostname, port: 443, path: `${url.pathname}${url.search}`, method: "GET", headers, servername: url.hostname,
    lookup: (_host, _options, callback) => (_options as { all?: boolean }).all ? (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]) : callback(null, address, family),
  }, (res) => {
    const out = new Headers();
    for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) out.set(key, Array.isArray(value) ? value.join(", ") : value);
    const status = res.statusCode ?? 0;
    const empty = status === 204 || status === 304 || (status >= 100 && status < 200);
    resolve(new Response(empty ? null : (Readable.toWeb(res) as unknown as ReadableStream), { status, headers: out }));
  });
  req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error("request timed out"), { name: "TimeoutError" })));
  req.on("error", reject);
  req.end();
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const chains = new Map<string, Promise<void>>();
const nextAt = new Map<string, number>();
const robotsCache = new Map<string, Promise<string | null>>();
export function resetGuardState() { chains.clear(); nextAt.clear(); robotsCache.clear(); }

/** One request per host at a time, `delayMs` apart. */
async function hostSlot(host: string, delayMs: number, now: () => number, wait: (ms: number) => Promise<void>): Promise<void> {
  const turn = (chains.get(host) ?? Promise.resolve()).then(async () => {
    const delay = Math.max(0, (nextAt.get(host) ?? 0) - now());
    if (delay) await wait(delay);
    nextAt.set(host, now() + delayMs);
  });
  chains.set(host, turn.catch(() => {}));
  await turn;
}

export const isSecHost = (host: string) => host === "sec.gov" || host.endsWith(".sec.gov");

/** Thrown when robots.txt disallows the path. Maps to `blocked`. */
export class RobotsDisallowed extends Error {
  constructor(message: string) { super(message); this.name = "RobotsDisallowed"; }
}
/** A non-2xx or non-4xx answer for the page itself. */
export class HttpFailure extends Error {
  constructor(readonly httpStatus: number, message: string) { super(message); this.name = "HttpFailure"; }
}
export class BodyTooLarge extends Error {
  constructor(readonly limit: number) { super(`response is over ${limit} bytes`); this.name = "BodyTooLarge"; }
}

/**
 * robots.txt check for one path (RFC 9309 subset): the group for our product token, else `*`; the longest matching rule wins,
 * Allow wins a tie; `*` and `$` work in patterns. No group or an empty file allows everything.
 */
export function robotsAllows(robotsTxt: string, path: string, agentToken = "InvestBuddy-source-verifier"): boolean {
  type Group = { agents: string[]; rules: { allow: boolean; pattern: string }[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
      else if (field === "allow") current.rules.push({ allow: true, pattern: "/" });
    } else lastWasAgent = false;
  }
  const token = agentToken.toLowerCase();
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && token.startsWith(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; length: number } | null = null;
  for (const group of chosen) for (const rule of group.rules) {
    const body = rule.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const anchored = body.endsWith("\\$") ? `${body.slice(0, -2)}$` : body;
    if (!new RegExp(`^${anchored}`).test(path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}

export interface GuardDeps {
  transport?: Transport;
  resolve?: Resolver;
  now?: () => Date;
  wait?: (ms: number) => Promise<void>;
  secUserAgent?: string;
  limits?: Partial<{ -readonly [K in keyof typeof GUARD_LIMITS]: number }>;
  /** Called before every request actually sent (robots.txt included). Throw to stop, for example when a usage cap is reached. */
  beforeRequest?: () => Promise<void>;
}

export interface GuardedPage { body: Uint8Array; contentType: string | null; finalUrl: URL; status: number }

type Reply = { status: number; headers: Headers; response: Response };

/** One guarded hop: checks the URL, waits for the host slot, sends the request pinned to a checked address. */
async function hop(raw: string, deps: GuardDeps, limits: typeof GUARD_LIMITS, accept: string): Promise<{ checked: CheckedUrl; reply: Reply }> {
  const wait = deps.wait ?? sleep;
  const nowMs = () => (deps.now ? deps.now().getTime() : Date.now());
  const checked = await assertPublicUrl(raw, deps.resolve ?? dnsResolver);
  const host = checked.url.hostname.toLowerCase().replace(/\.$/, "");
  const sec = isSecHost(host);
  const agent = sec ? requireSecUserAgent(deps.secUserAgent ?? process.env.SEC_USER_AGENT) : USER_AGENT;
  if (sec) await secSlot(); else await hostSlot(host, limits.hostDelayMs, nowMs, wait);
  await deps.beforeRequest?.();
  const response = await (deps.transport ?? pinnedTransport)({ url: checked.url, address: checked.addresses[0], headers: { "User-Agent": agent, Accept: accept, "Accept-Encoding": "identity" }, timeoutMs: limits.timeoutMs });
  return { checked, reply: { status: response.status, headers: response.headers, response } };
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel().catch(() => {}); throw new BodyTooLarge(maxBytes); }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new BodyTooLarge(maxBytes); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function robotsFor(origin: URL, deps: GuardDeps, limits: typeof GUARD_LIMITS): Promise<string | null> {
  const key = origin.hostname.toLowerCase();
  let cached = robotsCache.get(key);
  if (!cached) {
    cached = (async () => {
      const { reply } = await hop(`https://${origin.hostname}/robots.txt`, deps, limits, "text/plain");
      // A 3xx on robots.txt is followed by nobody: treated as no file, as the 4xx cases are.
      if (reply.status >= 500) { await reply.response.body?.cancel().catch(() => {}); throw new HttpFailure(reply.status, `robots.txt answered ${reply.status}`); }
      if (reply.status < 200 || reply.status >= 300) { await reply.response.body?.cancel().catch(() => {}); return null; }
      return new TextDecoder().decode(await readCapped(reply.response, limits.maxRobotsBytes));
    })();
    robotsCache.set(key, cached);
    cached.catch(() => robotsCache.delete(key));
  }
  return cached;
}

/**
 * Guarded GET. Every hop (the first URL and up to 3 redirects) is checked by the SSRF rules and robots.txt before it is sent.
 * Throws UrlBlocked, RobotsDisallowed, HttpFailure, BodyTooLarge, or an Error for a timeout, a bad content type or too many redirects.
 */
export async function guardedGet(rawUrl: string, deps: GuardDeps = {}): Promise<GuardedPage> {
  const limits = { ...GUARD_LIMITS, ...deps.limits } as typeof GUARD_LIMITS;
  let current = rawUrl;
  for (let redirects = 0; redirects <= limits.maxRedirects; redirects++) {
    const pre = await assertPublicUrl(current, deps.resolve ?? dnsResolver);
    const robots = await robotsFor(pre.url, deps, limits);
    if (robots !== null && !robotsAllows(robots, `${pre.url.pathname}${pre.url.search}`)) throw new RobotsDisallowed(`robots.txt disallows ${safeUrl(pre.url)}`);
    const { checked, reply } = await hop(current, deps, limits, "text/html, application/xhtml+xml, text/plain;q=0.9, application/pdf;q=0.8");
    if (reply.status >= 300 && reply.status < 400) {
      const location = reply.headers.get("location");
      await reply.response.body?.cancel().catch(() => {});
      if (!location) throw new Error(`redirect without location at ${safeUrl(checked.url)}`);
      current = new URL(location, checked.url).toString();
      continue; // the next hop is validated at the top of the loop, before anything is sent
    }
    if (reply.status >= 200 && reply.status < 300) {
      const contentType = reply.headers.get("content-type");
      if (!contentTypeAllowed(contentType)) { await reply.response.body?.cancel().catch(() => {}); throw new Error(`content type not allowed: ${mediaType(contentType) || "none"}`); }
      return { body: await readCapped(reply.response, limits.maxBytes), contentType, finalUrl: checked.url, status: reply.status };
    }
    await reply.response.body?.cancel().catch(() => {});
    throw new HttpFailure(reply.status, `HTTP ${reply.status} at ${safeUrl(checked.url)}`);
  }
  throw new Error(`too many redirects (over ${limits.maxRedirects}) from ${safeUrl(rawUrl)}`);
}
