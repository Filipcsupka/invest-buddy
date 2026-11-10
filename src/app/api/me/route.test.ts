import { afterEach, expect, it, vi } from "vitest";
import { customerCookieName } from "@/auth/cookie";
import { issueOwnerSession, OWNER_SESSION_COOKIE } from "@/security/owner-session";

const state = vi.hoisted(() => ({ plan: { plan: "free", endsAt: null } as { plan: "free" | "plus" | "trial"; endsAt: Date | null }, deleted: false, fail: false }));
vi.mock("@/db/pool", () => ({ getPool: () => ({ query: async () => ({ rows: state.deleted ? [] : [{ id: "7" }] }) }) }));
vi.mock("@/entitlements/plan", () => ({ customerPlan: async () => { if (state.fail) throw new Error("db down"); return state.plan; } }));
import { meFromHeaders, ME_HEADERS } from "./me";
import { GET } from "./route";

const keys = ["AUTH", "MARKETS_VIEWS", "OWNER_RESEARCH_PASSWORD", "OWNER_SESSION_SECRET"] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  state.plan = { plan: "free", endsAt: null };
  state.deleted = false;
  state.fail = false;
});

const customerCookie = `${customerCookieName("session", true)}=token`;
const reader = (email = "ana@example.com") => async () => ({ user: { id: 7, email } });
const NOW = new Date("2026-11-10T12:00:00Z");

it("answers anonymous with private, no-store and Vary: Cookie", async () => {
  const response = await GET(new Request("https://example.com/api/me"));
  expect(await response.json()).toEqual({ kind: "anon", markets: false });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(ME_HEADERS["Cache-Control"]).toBe("private, no-store");
});

it("clears a sign-in hint left behind by an ended session", async () => {
  const response = await GET(new Request("https://example.com/api/me", { headers: { cookie: "ib_signed_in=1" } }));
  expect(await response.json()).toEqual({ kind: "anon", markets: false });
  expect(response.headers.get("set-cookie")).toBe("ib_signed_in=; Path=/; Max-Age=0; SameSite=Lax");
});

it("recognises the owner by session cookie or Basic, with Markets only when the flag is on", async () => {
  process.env.OWNER_RESEARCH_PASSWORD = "owner-pass";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  const cookie = new Headers({ cookie: `${OWNER_SESSION_COOKIE}=${issueOwnerSession("owner-pass")}` });
  expect(await meFromHeaders(cookie)).toEqual({ kind: "owner", markets: false });
  process.env.MARKETS_VIEWS = "on";
  expect(await meFromHeaders(cookie)).toEqual({ kind: "owner", markets: true });
  const basic = new Headers({ authorization: `Basic ${Buffer.from("owner:owner-pass").toString("base64")}` });
  expect((await meFromHeaders(basic)).kind).toBe("owner");
  expect((await meFromHeaders(new Headers({ authorization: `Basic ${Buffer.from("owner:wrong").toString("base64")}` }))).kind).toBe("anon");
});

it("reports a customer's email and plan only with AUTH on", async () => {
  const headers = new Headers({ cookie: customerCookie });
  expect(await meFromHeaders(headers, reader(), NOW)).toEqual({ kind: "anon", markets: false });
  process.env.AUTH = "on";
  expect(await meFromHeaders(headers, reader(), NOW)).toEqual({ kind: "customer", email: "ana@example.com", plan: "free", markets: false });
  state.plan = { plan: "plus", endsAt: null };
  expect(await meFromHeaders(headers, reader(), NOW)).toEqual({ kind: "customer", email: "ana@example.com", plan: "plus", markets: false });
  state.plan = { plan: "trial", endsAt: new Date("2026-11-21T08:00:00Z") };
  expect(await meFromHeaders(headers, reader(), NOW)).toEqual({ kind: "customer", email: "ana@example.com", plan: "trial", trialDaysLeft: 11, markets: false });
});

it("never gives a customer the owner state or Markets, and treats a deleted user as signed out", async () => {
  process.env.AUTH = "on";
  process.env.MARKETS_VIEWS = "on";
  const me = await meFromHeaders(new Headers({ cookie: customerCookie }), reader(), NOW);
  expect(me).toMatchObject({ kind: "customer", markets: false });
  expect(JSON.stringify(me)).not.toMatch(/"id"|userId|token/);
  state.deleted = true;
  expect(await meFromHeaders(new Headers({ cookie: customerCookie }), reader(), NOW)).toEqual({ kind: "anon", markets: false });
  expect(await meFromHeaders(new Headers(), reader(), NOW)).toEqual({ kind: "anon", markets: false });
});

it("fails closed to anonymous with a private 503", async () => {
  process.env.AUTH = "on";
  state.fail = true;
  const response = await GET(new Request("https://example.com/api/me", { headers: { cookie: customerCookie } }));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
