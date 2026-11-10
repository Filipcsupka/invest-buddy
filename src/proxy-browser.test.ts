import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { issueOwnerSession, OWNER_SESSION_COOKIE } from "@/security/owner-session";
import { customerCookieName } from "@/auth/cookie";

vi.mock("@/data/store", () => ({ instrumentForTicker: async (ticker: string) => (ticker.toUpperCase() === "NVDA" ? { ticker: "NVDA" } : null) }));
import { proxy } from "./proxy";

const keys = ["EODHD_PRIVATE_USE", "OWNER_RESEARCH_PASSWORD", "OWNER_SESSION_SECRET", "MARKETS_VIEWS", "OWNER_VIEW"] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
});

const PASSWORD = "private-test-password";
function setup() {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.OWNER_VIEW = "on";
  process.env.OWNER_RESEARCH_PASSWORD = PASSWORD;
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
}

// What a browser sends for a page load, a Next.js prefetch, a client navigation and a script fetch.
const document = { accept: "text/html,application/xhtml+xml", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" };
const prefetch = { rsc: "1", "next-router-prefetch": "1", accept: "*/*", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" };
const navigation = { rsc: "1", "next-router-state-tree": "%5B%5D", accept: "*/*", "sec-fetch-dest": "empty" };
const fetchCall = { accept: "*/*", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" };
const curl = { accept: "*/*" };

const gated = ["/en/dashboard", "/en/scanner", "/en/track-record", "/en/heatmap", "/en/etf", "/en/company/NVDA", "/en/insiders", "/sk/indices"];
/** Next makes a same-origin Location relative on the way out; here the raw header is absolute on the request origin. */
const where = (response: Response) => { const raw = response.headers.get("location"); if (!raw) return null; const url = new URL(raw); expect(url.origin).toBe("https://example.com"); return `${url.pathname}${url.search}`; };
const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`https://example.com${path}`, { headers });

it.each(gated)("never sends a Basic challenge to a browser on %s", async (path) => {
  setup();
  for (const headers of [document, prefetch, navigation, fetchCall]) {
    const response = await proxy(request(path, headers));
    expect(response.headers.get("www-authenticate"), JSON.stringify(headers)).toBeNull();
    expect(response.status).not.toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});

it.each(gated)("sends an anonymous page load on %s to sign-in with a relative next", async (path) => {
  setup();
  const response = await proxy(request(`${path}?tab=1`, document));
  expect(response.status).toBe(307);
  const locale = path.split("/")[1];
  expect(where(response)).toBe(`/${locale}/sign-in?mode=sign-in&next=${encodeURIComponent(`${path}?tab=1`)}`);
});

it("answers prefetches and fetches with a plain 401", async () => {
  setup();
  for (const headers of [prefetch, navigation, fetchCall]) {
    const response = await proxy(request("/en/dashboard", headers));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  }
});

it("keeps the Basic challenge for non-browser clients", async () => {
  setup();
  for (const path of [...gated, "/en/owner/horizons"]) {
    const response = await proxy(request(path, curl));
    expect(response.status, path).toBe(401);
    expect(response.headers.get("www-authenticate"), path).toContain("Basic");
  }
  expect((await proxy(request("/en/dashboard"))).headers.get("www-authenticate")).toContain("Basic");
});

it("sends a signed-in customer to the opens-soon page, not to sign-in", async () => {
  setup();
  const cookie = `${customerCookieName("session", true)}=token`;
  const response = await proxy(request("/en/indices", { ...document, cookie }));
  expect(response.status).toBe(307);
  expect(where(response)).toBe("/en/opens-soon?page=indices");
  expect(response.headers.get("www-authenticate")).toBeNull();
  const prefetched = await proxy(request("/en/dashboard", { ...prefetch, cookie }));
  expect(prefetched.status).toBe(401);
  expect(prefetched.headers.get("www-authenticate")).toBeNull();
});

it("lets the owner through with the session cookie or Basic, and sets the sign-in hint for the cookie", async () => {
  setup();
  const cookie = `${OWNER_SESSION_COOKIE}=${issueOwnerSession(PASSWORD)}`;
  const basic = `Basic ${Buffer.from(`owner:${PASSWORD}`).toString("base64")}`;
  for (const path of gated) {
    const viaCookie = await proxy(request(path, { ...document, cookie }));
    expect(viaCookie.status, path).toBe(200);
    expect(viaCookie.headers.get("set-cookie"), path).toMatch(/^ib_signed_in=1; Path=\/; Max-Age=43200; SameSite=Lax; Secure$/);
    expect((await proxy(request(path, { ...prefetch, cookie }))).status, path).toBe(200);
    expect((await proxy(request(path, { authorization: basic }))).status, path).toBe(200);
  }
  const hinted = await proxy(request("/en/dashboard", { ...document, cookie: `${cookie}; ib_signed_in=1` }));
  expect(hinted.headers.get("set-cookie")).toBeNull();
});

it("keeps the owner area redirect for page loads and drops the popup for prefetches", async () => {
  setup();
  const page = await proxy(request("/en/owner/horizons", document));
  expect(page.status).toBe(303);
  expect(where(page)).toBe("/en/owner-sign-in");
  const prefetched = await proxy(request("/en/owner/horizons", prefetch));
  expect(prefetched.status).toBe(401);
  expect(prefetched.headers.get("www-authenticate")).toBeNull();
});

it("leaves public marketing pages open to everyone", async () => {
  setup();
  for (const path of ["/en", "/en/methodology", "/en/legal/terms", "/en/sign-in", "/en/opens-soon"]) {
    expect((await proxy(request(path, document))).status, path).toBe(200);
  }
});
