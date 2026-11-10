import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { forgetIdentity, getServerSnapshot, getSnapshot, ME_CACHE_KEY, parseMe, resetIdentityStore, subscribe } from "./identity-store";

function browser(cookie: string, stored: Record<string, string> = {}) {
  const storage = new Map(Object.entries(stored));
  vi.stubGlobal("document", { cookie, visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("window", { sessionStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } });
  return storage;
}
const fetchMock = vi.fn();
beforeEach(() => { resetIdentityStore(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

it("keeps the server snapshot pending so no user state reaches shared HTML", () => {
  expect(getServerSnapshot()).toEqual({ status: "server" });
});

it("treats a visitor without the sign-in hint as anonymous and never calls /api/me", () => {
  browser("theme=dark");
  subscribe(() => {});
  expect(getSnapshot()).toEqual({ status: "ready", me: { kind: "anon", markets: false } });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("shows only a skeleton until /api/me answers, even when an earlier account was stored in this tab", async () => {
  const storage = browser("ib_signed_in=1", { [ME_CACHE_KEY]: JSON.stringify({ kind: "customer", email: "previous@example.com", plan: "plus" }) });
  let answer: (response: Response) => void = () => {};
  fetchMock.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve; }));
  const listener = vi.fn();
  subscribe(listener);
  expect(getSnapshot()).toEqual({ status: "pending" });
  expect(JSON.stringify(getSnapshot())).not.toContain("previous@example.com");
  expect(storage.has(ME_CACHE_KEY)).toBe(false);
  expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  answer(new Response(JSON.stringify({ kind: "customer", email: "a@b.cz", plan: "plus" }), { headers: { "content-type": "application/json" } }));
  await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  expect(getSnapshot()).toEqual({ status: "ready", me: { kind: "customer", email: "a@b.cz", plan: "plus", markets: false } });
  expect(storage.has(ME_CACHE_KEY)).toBe(false);
  for (const [key] of storage) expect(storage.get(key)).not.toContain("a@b.cz");
});

it("never writes the account to browser storage", async () => {
  const storage = browser("ib_signed_in=1");
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ kind: "customer", email: "a@b.cz", plan: "free" }), { headers: { "content-type": "application/json" } }));
  const listener = vi.fn();
  subscribe(listener);
  await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  expect(storage.size).toBe(0);
});

it("drops the answer and any stored copy when the hint is gone", () => {
  const storage = browser("", { [ME_CACHE_KEY]: JSON.stringify({ kind: "owner", markets: true }) });
  expect(getSnapshot()).toEqual({ status: "ready", me: { kind: "anon", markets: false } });
  expect(storage.has(ME_CACHE_KEY)).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("clears the stored copy and the shown account on sign-out, and resets to a skeleton when another tab changes the session", async () => {
  const storage = browser("ib_signed_in=1");
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ kind: "customer", email: "a@b.cz", plan: "free" }), { headers: { "content-type": "application/json" } }));
  const listener = vi.fn();
  subscribe(listener);
  await vi.waitFor(() => expect(getSnapshot().status).toBe("ready"));
  storage.set(ME_CACHE_KEY, "legacy");
  forgetIdentity();
  expect(storage.has(ME_CACHE_KEY)).toBe(false);
  expect(getSnapshot()).toEqual({ status: "pending" });
});

it("accepts only shapes the island can render", () => {
  expect(parseMe({ kind: "owner" })).toEqual({ kind: "owner", markets: false });
  expect(parseMe({ kind: "customer", email: "a@b.cz", plan: "trial", trialDaysLeft: 4.7 })).toEqual({ kind: "customer", email: "a@b.cz", plan: "trial", trialDaysLeft: 4, markets: false });
  expect(parseMe({ kind: "customer", email: "a@b.cz", plan: "gold" })).toBeNull();
  expect(parseMe({ kind: "admin" })).toBeNull();
  expect(parseMe(null)).toBeNull();
});
