import { afterEach, expect, it } from "vitest";
import { clientKey, createLimiter, rateLimit, rateLimitExempt, resetRateLimits } from "./rate-limit";
import { contentSecurityPolicy, securityHeaders } from "./headers";

const req = (path: string, headers: Record<string, string> = {}) => ({ nextUrl: { pathname: path }, headers: new Headers(headers) });
afterEach(() => { resetRateLimits(); delete process.env.RATE_LIMIT; delete process.env.RATE_LIMIT_PAGES_PER_MIN; delete process.env.RATE_LIMIT_API_PER_MIN; });

it("sets frame-ancestors, referrer and permissions policy; HSTS only in production", () => {
  const prod = Object.fromEntries(securityHeaders(true).map((h) => [h.key, h.value]));
  expect(prod["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  expect(prod["Content-Security-Policy"]).toContain("object-src 'none'");
  expect(prod["Content-Security-Policy"]).not.toContain("unsafe-eval");
  expect(prod["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(prod["Permissions-Policy"]).toContain("camera=()");
  expect(prod["X-Content-Type-Options"]).toBe("nosniff");
  expect(prod["Strict-Transport-Security"]).toMatch(/^max-age=\d+$/);
  const dev = Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value]));
  expect(dev["Strict-Transport-Security"]).toBeUndefined();
  expect(contentSecurityPolicy(true)).toContain("unsafe-eval");
});

it("allows a burst, refuses the next call with Retry-After, refills over time", () => {
  const limiter = createLimiter({ perMinute: 2 });
  expect(limiter.take("a", 0).ok).toBe(true);
  expect(limiter.take("a", 0).ok).toBe(true);
  const denied = limiter.take("a", 0);
  expect(denied).toEqual({ ok: false, retryAfter: 30 });
  expect(limiter.take("b", 0).ok).toBe(true);
  expect(limiter.take("a", 30_000).ok).toBe(true);
});

it("caps stored keys and evicts the least recently used", () => {
  const limiter = createLimiter({ perMinute: 1, maxKeys: 2 });
  limiter.take("a", 0); limiter.take("b", 0); limiter.take("c", 0);
  expect(limiter.take("a", 0).ok).toBe(true); // a was evicted, fresh bucket
  expect(limiter.take("c", 0).ok).toBe(false); // c kept its spent bucket
});

it("hashes the client IP and ignores forged left-side x-forwarded-for entries", () => {
  const key = clientKey(new Headers({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }), 1);
  expect(key).toBe(clientKey(new Headers({ "x-forwarded-for": "7.7.7.7, 9.9.9.9" }), 1));
  expect(key).not.toBe(clientKey(new Headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }), 1));
  expect(key).not.toContain("9.9.9.9");
});

it("exempts health and bearer ingest only", () => {
  expect(rateLimitExempt("/api/health", new Headers())).toBe(true);
  expect(rateLimitExempt("/api/ingest/scan", new Headers({ authorization: "Bearer t" }))).toBe(true);
  expect(rateLimitExempt("/api/ingest/scan", new Headers())).toBe(false);
  expect(rateLimitExempt("/en/dashboard", new Headers({ authorization: "Bearer t" }))).toBe(false);
});

it("returns 429 with Retry-After for pages and JSON for api, and honours off", async () => {
  process.env.RATE_LIMIT_PAGES_PER_MIN = "1"; process.env.RATE_LIMIT_API_PER_MIN = "1";
  const h = { "x-forwarded-for": "1.1.1.1" };
  expect(rateLimit(req("/en/dashboard", h), 0)).toBeUndefined();
  const page = rateLimit(req("/en/dashboard", h), 0)!;
  expect(page.status).toBe(429);
  expect(Number(page.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(rateLimit(req("/api/x", h), 0)).toBeUndefined();
  const api = rateLimit(req("/api/x", h), 0)!;
  expect(api.status).toBe(429);
  expect(await api.json()).toEqual({ error: "Too many requests" });
  process.env.RATE_LIMIT = "off";
  expect(rateLimit(req("/en/dashboard", h), 0)).toBeUndefined();
});

it("adds the analytics origin to script-src and connect-src only when analytics is configured", () => {
  const off = contentSecurityPolicy(false, null);
  expect(off).toContain("connect-src 'self';");
  expect(off).not.toContain("stats.example.org");
  const on = contentSecurityPolicy(false, { scriptSrc: "https://stats.example.org/js/script.js" });
  expect(on).toContain("script-src 'self' 'unsafe-inline' https://stats.example.org;");
  expect(on).toContain("connect-src 'self' https://stats.example.org;");
  expect(on).not.toContain("stats.example.org/js");
});
