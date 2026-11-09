import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: undefined as unknown }));
vi.mock("@/db/pool", () => ({ getPool: () => holder.pool }));

import { POST as authPost } from "./[...all]/route";
import { POST as recoveryPost } from "./recovery/[action]/route";
import { POST as accountPost } from "./account/[action]/route";
import { createInitialRecoveryCodes, revealInitialRecoveryCodes } from "@/auth/recovery";
import { CUSTOMER_SESSION_COOKIE } from "@/auth/cookie";

const SITE = "https://invest.example.test";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const name of ["001_initial.sql", "133_customer_auth.sql", "134_customer_entitlements.sql", "135_customer_recovery_codes.sql"]) {
    await db.exec(readFileSync(join(process.cwd(), "migrations", name), "utf8"));
  }
  const query = async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
  };
  holder.pool = { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool;
  vi.stubEnv("AUTH", "on");
  vi.stubEnv("TRIAL", "on");
  vi.stubEnv("AUTH_URL", SITE);
  vi.stubEnv("AUTH_SECRET", "a-test-secret-of-at-least-thirty-two-characters");
  vi.stubEnv("RATE_LIMIT_TRUSTED_HOPS", "1");
}, 60_000);
afterAll(async () => { vi.unstubAllEnvs(); await db.close(); });
beforeEach(async () => { await db.query("DELETE FROM auth_rate_limits"); });

let ipCounter = 10;
const freshIp = () => `203.0.113.${ipCounter++}`;
const post = (path: string, body: unknown, options: { ip?: string; origin?: string; cookie?: string } = {}) => new Request(`${SITE}${path}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: options.origin ?? SITE,
    "x-forwarded-for": options.ip ?? freshIp(),
    ...(options.cookie ? { cookie: options.cookie } : {}),
  },
  body: JSON.stringify(body),
});
const action = (name: string) => ({ params: Promise.resolve({ action: name }) });

async function signUp(email: string, ip?: string) {
  return authPost(post("/api/auth/sign-up/email", { name: "T", email, password: "Correct Horse 42" }, { ip }));
}

it("refuses a cross-origin POST before Better Auth runs", async () => {
  const response = await signUp("x@example.test").then(() => authPost(post("/api/auth/sign-in/email", { email: "x@example.test", password: "Correct Horse 42" }, { origin: "https://evil.example" })));
  expect(response.status).toBe(403);
});

it("returns 404 while AUTH is off", async () => {
  vi.stubEnv("AUTH", "off");
  try { expect((await authPost(post("/api/auth/sign-up/email", {}))).status).toBe(404); }
  finally { vi.stubEnv("AUTH", "on"); }
});

it("keeps magic link off unless MAGIC_LINK is on", async () => {
  const response = await authPost(post("/api/auth/sign-in/magic-link", { email: "m@example.test" }));
  expect(response.status).toBe(404);
});

it("rejects a common password and lowercases the email at sign-up", async () => {
  expect((await authPost(post("/api/auth/sign-up/email", { name: "T", email: "c@example.test", password: "password123" }))).status).toBe(400);
  const ok = await signUp("  Mixed.Case@Example.TEST ");
  expect(ok.status).toBe(200);
  expect(ok.headers.get("cache-control")).toBe("private, no-store");
  expect((await db.query("SELECT 1 FROM users WHERE email = 'mixed.case@example.test'")).rows).toHaveLength(1);
}, 30_000);

it("limits sign-up to five per IP per hour", async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i++) expect((await signUp(`ip${i}@example.test`, ip)).status).toBe(200);
  const blocked = await signUp("ip5@example.test", ip);
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("retry-after")).toBe("3600");
}, 60_000);

it("limits password sign-in to ten per email per hour across IPs", async () => {
  await signUp("target@example.test");
  for (let i = 0; i < 10; i++) {
    const response = await authPost(post("/api/auth/sign-in/email", { email: "target@example.test", password: "wrong password 1" }));
    expect(response.status).not.toBe(429);
  }
  expect((await authPost(post("/api/auth/sign-in/email", { email: "TARGET@example.test", password: "Correct Horse 42" }))).status).toBe(429);
}, 60_000);

it("resets a password with a recovery code, revokes sessions and does not reveal which emails exist", async () => {
  const signedUp = await signUp("reset@example.test");
  const cookie = signedUp.headers.getSetCookie().find((value) => value.startsWith(`${CUSTOMER_SESSION_COOKIE}=`))!.split(";")[0];
  const userId = (await db.query<{ id: string }>("SELECT id::text FROM users WHERE email = 'reset@example.test'")).rows[0].id;
  const [code] = await revealInitialRecoveryCodes(holder.pool as pg.Pool, userId);
  expect(code).toBeTruthy();

  const unknown = await recoveryPost(post("/api/auth/recovery/reset", { email: "nobody@example.test", code, newPassword: "Another Strong 99" }), action("reset"));
  const wrongCode = await recoveryPost(post("/api/auth/recovery/reset", { email: "reset@example.test", code: "AAAA-BBBB", newPassword: "Another Strong 99" }), action("reset"));
  const good = await recoveryPost(post("/api/auth/recovery/reset", { email: "reset@example.test", code, newPassword: "Another Strong 99" }), action("reset"));
  const bodies = await Promise.all([unknown, wrongCode, good].map(async (response) => [response.status, await response.text()]));
  expect(new Set(bodies.map((entry) => JSON.stringify(entry))).size).toBe(1);
  expect((await db.query("SELECT 1 FROM auth_sessions WHERE user_id = $1", [userId])).rows).toHaveLength(0);

  const oldPassword = await authPost(post("/api/auth/sign-in/email", { email: "reset@example.test", password: "Correct Horse 42" }));
  expect(oldPassword.status).toBe(401);
  const newPassword = await authPost(post("/api/auth/sign-in/email", { email: "reset@example.test", password: "Another Strong 99" }));
  expect(newPassword.status).toBe(200);
  const reused = await recoveryPost(post("/api/auth/recovery/reset", { email: "reset@example.test", code, newPassword: "Third Strong Pass 7" }), action("reset"));
  expect(reused.status).toBe(200);
  const stillSecond = await authPost(post("/api/auth/sign-in/email", { email: "reset@example.test", password: "Another Strong 99" }));
  expect(stillSecond.status).toBe(200);

  // The revoked cookie cannot export or delete: those routes skip the session cookie cache.
  const exportAttempt = await accountPost(new Request(`${SITE}/api/auth/account/delete`, { method: "POST", headers: { Origin: SITE, cookie }, body: new URLSearchParams({ confirm: "DELETE" }) }), action("delete"));
  expect(exportAttempt.status).toBe(401);
  expect((await db.query("SELECT 1 FROM users WHERE id = $1", [userId])).rows).toHaveLength(1);
}, 60_000);

it("limits recovery reset per email", async () => {
  const email = "limited@example.test";
  for (let i = 0; i < 5; i++) expect((await recoveryPost(post("/api/auth/recovery/reset", { email, code: "AAAA", newPassword: "Another Strong 99" }), action("reset"))).status).toBe(200);
  expect((await recoveryPost(post("/api/auth/recovery/reset", { email, code: "AAAA", newPassword: "Another Strong 99" }), action("reset"))).status).toBe(429);
}, 60_000);

it("deletes the account and clears every customer cookie", async () => {
  const signedUp = await signUp("delete@example.test");
  const cookie = signedUp.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const userId = (await db.query<{ id: string }>("SELECT id::text FROM users WHERE email = 'delete@example.test'")).rows[0].id;
  await createInitialRecoveryCodes(holder.pool as pg.Pool, userId);
  const response = await accountPost(new Request(`${SITE}/api/auth/account/delete`, { method: "POST", headers: { Origin: SITE, cookie }, body: new URLSearchParams({ confirm: "DELETE", locale: "sk" }) }), action("delete"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/sk");
  expect(response.headers.getSetCookie().some((value) => value.startsWith(`${CUSTOMER_SESSION_COOKIE}=;`))).toBe(true);
  expect((await db.query("SELECT 1 FROM users WHERE id = $1", [userId])).rows).toHaveLength(0);
  expect((await db.query("SELECT 1 FROM user_recovery_codes WHERE user_id = $1", [userId])).rows).toHaveLength(0);
}, 60_000);
