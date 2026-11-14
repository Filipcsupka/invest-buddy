import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { customerCookieName } from "@/auth/cookie";

// A cookie counts only when Better Auth resolves it to a session and the user row exists. The fakes decide by the cookie value.
const auth = vi.hoisted(() => ({ getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
  const cookie = headers.get("cookie") ?? "";
  if (cookie.includes("=owner")) return { user: { id: 7, email: "owner@example.com" } };
  if (cookie.includes("=pwowner")) return { user: { id: 8, email: "owner@example.com" } };
  return cookie.includes("=valid") ? { user: { id: 9, email: "ana@example.com" } } : null;
}) }));
vi.mock("@/auth/server", () => ({ customerAuth: () => ({ api: { getSession: auth.getSession } }) }));
vi.mock("@/db/pool", () => ({ getPool: () => ({ query: async () => ({ rows: [{ id: "7" }] }) }) }));
vi.mock("@/entitlements/plan", () => ({ customerPlan: async () => ({ plan: "free", endsAt: null }) }));
vi.mock("@/data/store", () => ({ instrumentForTicker: async (ticker: string) => (ticker.toUpperCase() === "NVDA" ? { ticker: "NVDA" } : null) }));
import { proxy } from "./proxy";
import { GET as meRoute } from "./app/api/me/route";

const keys = ["AUTH", "EODHD_PRIVATE_USE", "OWNER_USER_IDS", "MARKETS_VIEWS", "OWNER_VIEW"] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  auth.getSession.mockClear();
  for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
});

function setup() {
  process.env.AUTH = "on";
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.OWNER_VIEW = "on";
  process.env.OWNER_USER_IDS = "7";
}

// What a browser sends for a page load, a Next.js prefetch, a client navigation and a script fetch.
const document = { accept: "text/html,application/xhtml+xml", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" };
const prefetch = { rsc: "1", "next-router-prefetch": "1", accept: "*/*", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" };
const navigation = { rsc: "1", "next-router-state-tree": "%5B%5D", accept: "*/*", "sec-fetch-dest": "empty" };
const fetchCall = { accept: "*/*", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" };
const curl = { accept: "*/*" };

const gated = ["/en/stocks", "/en/track-record", "/en/heatmap", "/en/etf", "/en/company/NVDA", "/en/insiders", "/sk/indices"];
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

it("opens the dashboard to every viewer; the page withholds its stock data", async () => {
  setup();
  for (const headers of [document, prefetch, curl, { ...document, cookie: `${customerCookieName("session", true)}=valid` }]) {
    const response = await proxy(request("/en/dashboard", headers));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  }
});

it("answers prefetches and fetches with a plain 401", async () => {
  setup();
  for (const headers of [prefetch, navigation, fetchCall]) {
    const response = await proxy(request("/en/stocks", headers));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  }
});

it("gives non-browser clients a plain 401, never a Basic challenge or a Basic login", async () => {
  setup();
  const basic = `Basic ${Buffer.from("owner:anything").toString("base64")}`;
  for (const path of [...gated, "/en/owner/horizons"]) {
    for (const headers of [curl, { ...curl, authorization: basic }]) {
      const response = await proxy(request(path, headers));
      expect(response.status, path).toBe(401);
      expect(response.headers.get("www-authenticate"), path).toBeNull();
    }
  }
  expect((await proxy(request("/en/stocks"))).headers.get("www-authenticate")).toBeNull();
});

const session = customerCookieName("session", true);

it("sends a customer with a verified session to the opens-soon page, not to sign-in", async () => {
  setup();
  const cookie = `${session}=valid`;
  const response = await proxy(request("/en/indices", { ...document, cookie }));
  expect(response.status).toBe(307);
  expect(where(response)).toBe("/en/opens-soon?page=indices");
  expect(response.headers.get("www-authenticate")).toBeNull();
  const prefetched = await proxy(request("/en/stocks", { ...prefetch, cookie }));
  expect(prefetched.status).toBe(401);
  expect(prefetched.headers.get("www-authenticate")).toBeNull();
});

it.each([
  ["a forged session cookie", `${session}=forged.value`],
  ["an expired session cookie", `${session}=expired`],
  ["the sign-in hint alone", "ib_signed_in=1"],
  ["a forged cookie next to the hint", `${session}=forged; ib_signed_in=1`],
])("treats %s as anonymous: a page load goes to sign-in with next", async (_name, cookie) => {
  setup();
  const response = await proxy(request("/en/indices?x=1", { ...document, cookie }));
  expect(response.status).toBe(307);
  expect(where(response)).toBe(`/en/sign-in?mode=sign-in&next=${encodeURIComponent("/en/indices?x=1")}`);
  expect(response.headers.get("www-authenticate")).toBeNull();
});

it("does not read a session for the hint alone or without a cookie, and reads one for a real cookie on a gated route", async () => {
  setup();
  await proxy(request("/en/stocks", { ...document, cookie: "ib_signed_in=1" }));
  await proxy(request("/en/stocks", curl));
  expect(auth.getSession).not.toHaveBeenCalled();
  await proxy(request("/en/stocks", { ...prefetch, cookie: `${session}=valid` }));
  expect(auth.getSession).toHaveBeenCalledTimes(1);
  await proxy(request("/en", { ...document, cookie: `${session}=valid` }));
  expect(auth.getSession).toHaveBeenCalledTimes(1);
});

it("treats a customer cookie as anonymous when AUTH is off or the session check fails", async () => {
  setup();
  const cookie = `${session}=valid`;
  process.env.AUTH = "off";
  expect(where(await proxy(request("/en/stocks", { ...document, cookie })))).toMatch(/^\/en\/sign-in\?/);
  process.env.AUTH = "on";
  auth.getSession.mockRejectedValueOnce(new Error("db down"));
  expect(where(await proxy(request("/en/stocks", { ...document, cookie })))).toMatch(/^\/en\/sign-in\?/);
});

it("lets a verified owner session through every gated route and never sets a hint cookie itself", async () => {
  setup();
  const cookie = `${session}=owner`;
  for (const path of gated) {
    const viaDocument = await proxy(request(path, { ...document, cookie }));
    expect(viaDocument.status, path).toBe(200);
    expect(viaDocument.headers.get("set-cookie"), path).toBeNull();
    expect(viaDocument.headers.get("cache-control"), path).toBe("private, no-store");
    expect((await proxy(request(path, { ...prefetch, cookie }))).status, path).toBe(200);
    expect((await proxy(request(path, { ...curl, cookie }))).status, path).toBe(200);
  }
  const identity = await meRoute(new Request("https://example.com/api/me", { headers: { cookie } }));
  expect(await identity.json()).toEqual({ kind: "owner", markets: true });
});

it("an account with the owner's email but another user id is not the owner", async () => {
  setup();
  const cookie = `${session}=pwowner`;
  const gate = await proxy(request("/en/indices", { ...document, cookie }));
  expect(gate.status).toBe(307);
  expect(where(gate)).toBe("/en/opens-soon?page=indices");
  expect((await proxy(request("/en/owner/horizons", { ...document, cookie }))).status).toBe(404);
  expect((await proxy(request("/en/stocks", { ...curl, cookie }))).status).toBe(401);
  const identity = await meRoute(new Request("https://example.com/api/me", { headers: { cookie } }));
  expect(await identity.json()).toMatchObject({ kind: "customer", plan: "free", markets: false });
});

it("owner access needs AUTH on, and the hint cookie alone grants nothing", async () => {
  setup();
  process.env.AUTH = "off";
  expect((await proxy(request("/en/stocks", { ...curl, cookie: `${session}=owner` }))).status).toBe(401);
  process.env.AUTH = "on";
  expect((await proxy(request("/en/stocks", { ...curl, cookie: "ib_signed_in=1" }))).status).toBe(401);
});

it("sends an anonymous owner-area page load to sign-in, a signed-in non-owner to 404, and prefetches to a plain 401", async () => {
  setup();
  const page = await proxy(request("/en/owner/horizons", document));
  expect(page.status).toBe(303);
  expect(where(page)).toBe(`/en/sign-in?mode=sign-in&next=${encodeURIComponent("/en/owner/horizons")}`);
  expect((await proxy(request("/en/owner/horizons", { ...document, cookie: `${session}=valid` }))).status).toBe(404);
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
