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
import { canUseFundData, canUseVendorData, isOwner } from "./viewer";

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
  delete process.env.OWNER_USER_IDS;
  delete process.env.OWNER_EMAILS;
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
  ["manual Passive", { tier: "passive", status: "active", source: "manual", starts_at: new Date(now - day), ends_at: null, cancel_at_period_end: false }, "passive", "free"],
  ["expired Passive", { tier: "passive", status: "active", source: "manual", starts_at: new Date(now - 31 * day), ends_at: new Date(now - day), cancel_at_period_end: false }, "free", "free"],
] as const)("customer with %s: plan, tier, never owner", async (_name, row, plan, tier) => {
  if (row) state.entitlements["7"] = { user_id: "7", provider_customer_id: null, provider_subscription_id: null, ...row };
  const viewer = await viewerFromHeaders(new Headers(customerCookie), session("7"));
  expect(viewer).toMatchObject({ tier, plan, owner: false, userId: "7", preview: false });
  // Stock vendor data: Active only. Fund data: Active and Passive.
  expect(canUseVendorData(viewer, { EODHD_PRIVATE_USE: "on" })).toBe(plan === "plus" || plan === "trial");
  expect(canUseFundData(viewer, { EODHD_PRIVATE_USE: "on" })).toBe(plan !== "free");
});

it("gives a paid tier to every customer while PAYWALL is off", async () => {
  process.env.PAYWALL = "off";
  expect(await viewerFromHeaders(new Headers(customerCookie), session("7"))).toMatchObject({ tier: "paid", plan: "free" });
});

it("ignores a cached session for a deleted user", async () => {
  state.users = {};
  expect(await viewerFromHeaders(new Headers(customerCookie), session("7"))).toEqual({ tier: "free", preview: false });
});

const sessionOf = (id: string) => async () => ({ user: { id } });

it("makes a session whose user id is in OWNER_USER_IDS the owner, with an admin tier", async () => {
  process.env.OWNER_USER_IDS = " 3 , 7";
  const viewer = await viewerFromHeaders(new Headers(customerCookie), sessionOf("7"));
  expect(viewer).toEqual({ tier: "admin", preview: false, owner: true, userId: "7" });
  expect(isOwner(viewer)).toBe(true);
  expect(canUseVendorData(viewer, { EODHD_PRIVATE_USE: "on" })).toBe(true);
});

it("keeps ?view=free for the owner only", async () => {
  process.env.OWNER_USER_IDS = "7";
  const owner = await viewerFromHeaders(new Headers({ ...customerCookie, "x-tier-preview": "free" }), sessionOf("7"));
  expect(owner).toMatchObject({ tier: "free", preview: true, owner: true });
});

it("another account with the owner's email but a different id is NOT the owner", async () => {
  process.env.OWNER_USER_IDS = "3";
  process.env.OWNER_EMAILS = "owner@example.com";
  const impostor = async () => ({ user: { id: "7", email: "owner@example.com", emailVerified: true } });
  const viewer = await viewerFromHeaders(new Headers(customerCookie), impostor);
  expect(isOwner(viewer)).toBe(false);
  expect(viewer.tier).not.toBe("admin");
  expect(canUseVendorData(viewer, { EODHD_PRIVATE_USE: "on" })).toBe(false);
});

it("with OWNER_USER_IDS unset nobody is the owner", async () => {
  delete process.env.OWNER_USER_IDS;
  expect(isOwner(await viewerFromHeaders(new Headers(customerCookie), sessionOf("7")))).toBe(false);
});

it("never trusts the sign-in hint cookie, a Basic header or an owner header", async () => {
  process.env.OWNER_USER_IDS = "7";
  const basic = `Basic ${Buffer.from("owner:anything").toString("base64")}`;
  const reader = vi.fn(noSession);
  const viewer = await viewerFromHeaders(new Headers({ cookie: "ib_signed_in=1", authorization: basic }), reader);
  expect(isOwner(viewer)).toBe(false);
  expect(reader).not.toHaveBeenCalled();
});

it("a deleted owner row is not the owner", async () => {
  process.env.OWNER_USER_IDS = "7";
  state.users = {};
  expect(isOwner(await viewerFromHeaders(new Headers(customerCookie), sessionOf("7")))).toBe(false);
});

it("owner access works with AUTH on whatever PAYWALL says, and not with AUTH off", async () => {
  process.env.OWNER_USER_IDS = "7";
  process.env.PAYWALL = "off";
  expect(isOwner(await viewerFromHeaders(new Headers(customerCookie), sessionOf("7")))).toBe(true);
  process.env.AUTH = "off";
  expect(isOwner(await viewerFromHeaders(new Headers(customerCookie), sessionOf("7")))).toBe(false);
});

it("does not make anonymous visitors admin while AUTH is off", async () => {
  process.env.AUTH = "off";
  process.env.PAYWALL = "off";
  expect(await viewerFromHeaders(new Headers(customerCookie), session("7"))).toEqual({ tier: "paid", preview: false });
});
