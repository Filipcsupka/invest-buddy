import { createHash, randomBytes } from "node:crypto";

export type Bucket = { tokens: number; at: number };
export type Limiter = { take(key: string, now?: number): { ok: boolean; retryAfter: number } };

/** In-memory token bucket. Per process: counters reset on restart and are per replica. */
export function createLimiter({ perMinute, maxKeys = 10_000 }: { perMinute: number; maxKeys?: number }): Limiter {
  const buckets = new Map<string, Bucket>();
  const rate = perMinute / 60_000;
  return {
    take(key, now = Date.now()) {
      const old = buckets.get(key);
      const tokens = Math.min(perMinute, (old?.tokens ?? perMinute) + (old ? (now - old.at) * rate : 0));
      buckets.delete(key); // reinsert so Map order is least recently used first
      if (tokens < 1) {
        buckets.set(key, { tokens, at: now });
        return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - tokens) / rate / 1000)) };
      }
      buckets.set(key, { tokens: tokens - 1, at: now });
      while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value as string);
      return { ok: true, retryAfter: 0 };
    },
  };
}

const salt = process.env.RATE_LIMIT_SECRET || randomBytes(16).toString("hex");

/** Traefik appends the peer address to x-forwarded-for, so count hops from the right; entries a client adds on the left are ignored. */
export function clientKey(headers: Headers, hops = Number(process.env.RATE_LIMIT_TRUSTED_HOPS ?? 1)): string {
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const ip = parts[Math.max(0, parts.length - Math.max(1, hops))] ?? headers.get("x-real-ip") ?? "unknown";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 24);
}

export function rateLimitExempt(pathname: string, headers: Headers): boolean {
  if (pathname === "/api/health") return true;
  return pathname.startsWith("/api/ingest/") && /^Bearer\s+\S/.test(headers.get("authorization") ?? "");
}

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

let pages: Limiter | undefined;
let api: Limiter | undefined;

/** Seconds to wait when the caller is over the limit, otherwise undefined. RATE_LIMIT=off disables. */
export function rateLimitRetryAfter(request: { nextUrl: { pathname: string }; headers: Headers }, now?: number): number | undefined {
  if (process.env.RATE_LIMIT === "off") return undefined;
  const { pathname } = request.nextUrl;
  if (rateLimitExempt(pathname, request.headers)) return undefined;
  pages ??= createLimiter({ perMinute: intEnv("RATE_LIMIT_PAGES_PER_MIN", 120) });
  api ??= createLimiter({ perMinute: intEnv("RATE_LIMIT_API_PER_MIN", 60) });
  const result = (pathname.startsWith("/api/") ? api : pages).take(clientKey(request.headers), now);
  return result.ok ? undefined : result.retryAfter;
}

/** Returns a 429 response when the caller is over the limit, otherwise undefined. */
export function rateLimit(request: { nextUrl: { pathname: string }; headers: Headers }, now?: number): Response | undefined {
  const retryAfter = rateLimitRetryAfter(request, now);
  if (retryAfter === undefined) return undefined;
  const headers = { "retry-after": String(retryAfter), "cache-control": "no-store" };
  return request.nextUrl.pathname.startsWith("/api/")
    ? Response.json({ error: "Too many requests" }, { status: 429, headers })
    : new Response("Too many requests. Try again shortly. / Príliš veľa požiadaviek. Skúste to neskôr.", { status: 429, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
}

/** Test hook: drop counters. */
export function resetRateLimits(): void { pages = undefined; api = undefined; }
