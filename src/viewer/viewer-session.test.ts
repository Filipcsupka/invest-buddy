import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state: { users: Record<string, Row>; entitlements: Record<string, Row> } = { users: {}, entitlements: {} };
const query = vi.fn(async (sql: string, params: unknown[]) => {
  const id = String(params[0]);
  if (sql.includes("FROM users")) return { rows: state.users[id] ? [{ id }] : [] };
  if (sql.includes("FROM entitlements")) return { rows: state.entitlements[id] ? [state.entitlements[id]] : [] };
  throw new Error(`unexpected query ${sql}`);
});
vi.mock("@/db/pool", () => ({ getPool: () => ({ query }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { viewerFromHeaders } from "./get-viewer";
import { canUseVendorData } from "./viewer";

const env = { ...process.env };
const day = 86_400_000;
const now = Date.now();
const customerCookie = { cookie: "__Host-ib_session=token.sig" };
const session = (id: string) => async () => ({ user: { id } });
const noSession = async () => null;

beforeEach(() => {
  state.users = { "7": {} };
  state.entitlements = {};
  process.env.AUTH = "on";
  process.env.PAYWALL = "on";
  process.env.OWNER_RESEARCH_PASSWORD = "owner-password-for-tests";
});
afterEach(() => { process.env = { ...env }; query.mockClear(); });

it("treats a forged or expired session as anonymous", async () => {
  expect(await viewerFromHeaders(new Headers(customerCookie), noSession)).toEqual({ tier: "free", preview: false });
});

it("skips the session lookup without a customer cookie", async () => {
  const reader = vi.fn(noSession);
  await viewerFromHeaders(new Headers({ cookie: "other=1" }), reader);
  expect(reader).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});

it.each([
  ["no entitlement", undefined, "free", "free"],
  ["active trial", { tier: "plus", status: "active", source: "manual", starts_at: new Date(now - day), ends_at: new Date(now + 13 * day), cancel_at_period_end: false }, "trial", "paid"],
  ["expired trial", { tier: "plus", status: "active", source: "manual", starts_at: new Date(now - 15 * day), ends_at: new Date(now - day), cancel_at_period_end: false }, "free", "free"],
  ["paid Plus", { tier: "plus", status: "active", source: "stripe", starts_at: new Date(now - day), ends_at: new Date(now + 29 * day), cancel_at_period_end: false }, "plus", "paid"],
] as const)("customer with %s: plan, tier, never owner", async (_name, row, plan, tier) => {
  if (row) state.entitlements["7"] = { user_id: "7", provider_customer_id: null, provider_subscription_id: null, ...row };
  const viewer = await viewerFromHeaders(new Headers(customerCookie), session("7"));
  expect(viewer).toMatchObject({ tier, plan, owner: false, userId: "7", preview: false });
  expect(canUseVendorData(viewer, { EODHD_PRIVATE_USE: "on", VENDOR_DISPLAY_LICENSE: "on" })).toBe(false);
});

it("gives a paid tier to every customer while PAYWALL is off", async () => {
  process.env.PAYWALL = "off";
  expect(await viewerFromHeaders(new Headers(customerCookie), session("7"))).toMatchObject({ tier: "paid", plan: "free" });
});

it("ignores a cached session for a deleted user", async () => {
  state.users = {};
  expect(await viewerFromHeaders(new Headers(customerCookie), session("7"))).toEqual({ tier: "free", preview: false });
});

it("keeps owner Basic auth admin and ignores the customer session for it", async () => {
  const basic = `Basic ${Buffer.from("owner:owner-password-for-tests").toString("base64")}`;
  const reader = vi.fn(session("7"));
  expect(await viewerFromHeaders(new Headers({ authorization: basic, ...customerCookie }), reader)).toEqual({ tier: "admin", preview: false, owner: true, userId: null });
  expect(reader).not.toHaveBeenCalled();
});

it("does not make anonymous visitors admin while AUTH is off", async () => {
  process.env.AUTH = "off";
  process.env.PAYWALL = "off";
  expect(await viewerFromHeaders(new Headers(customerCookie), session("7"))).toEqual({ tier: "paid", preview: false });
});
