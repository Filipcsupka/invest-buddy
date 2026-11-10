import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: undefined as unknown }));
vi.mock("@/db/pool", () => ({ getPool: () => holder.pool }));

import { GET as authGet, POST as authPost } from "./[...all]/route";
import { POST as recoveryPost } from "./recovery/[action]/route";
import { POST as accountPost } from "./account/[action]/route";
import { createInitialRecoveryCodes, revealInitialRecoveryCodes } from "@/auth/recovery";
import { CUSTOMER_SESSION_COOKIE } from "@/auth/cookie";
import { createRecoveryCodes, resetWithRecoveryCode, signInWithGoogle, signInWithPassword, signUpWithPassword } from "@/auth/client-api";

const SITE = "https://invest.example.test";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const name of ["001_initial.sql", "133_customer_auth.sql", "134_customer_entitlements.sql", "135_customer_recovery_codes.sql", "136_trial_claims.sql"]) {
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
  vi.stubEnv("MAIL_PROVIDER", "console");
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

const userIdOf = async (email: string) => (await db.query<{ id: string }>("SELECT id::text FROM users WHERE email = $1", [email])).rows[0].id;

it("returns 404 for Better Auth routes outside the allowlist", async () => {
  for (const path of ["/api/auth/change-password", "/api/auth/revoke-sessions", "/api/auth/send-verification-email", "/api/auth/update-user"]) {
    expect((await authPost(post(path, { email: "x@example.test" }))).status).toBe(404);
  }
  expect((await authGet(new Request(`${SITE}/api/auth/magic-link/verify?token=abcdefghijklmnopqrstuvwxyz`))).status).toBe(404);
  expect((await authGet(new Request(`${SITE}/api/auth/list-sessions`))).status).toBe(404);
  expect((await authGet(new Request(`${SITE}/api/auth/get-session`))).status).toBe(200);
});

it("keys the sign-up IP limit on the proxy-appended address, not a spoofed X-Forwarded-For prefix", async () => {
  for (let i = 0; i < 5; i++) expect((await signUp(`spoof${i}@example.test`, `198.51.100.${i}, 192.0.2.250`)).status).toBe(200);
  expect((await signUp("spoof5@example.test", "198.51.100.99, 192.0.2.250")).status).toBe(429);
}, 60_000);

it("shares the per-email sign-up limit across +tags and Gmail dots", async () => {
  const variants = ["bucket@gmail.com", "bucket+1@gmail.com", "b.ucket@gmail.com", "bucket+x@googlemail.com", "bu.cket+2@gmail.com"];
  for (const email of variants) expect((await signUp(email)).status).toBe(200);
  expect((await signUp("b.u.c.k.e.t+6@gmail.com")).status).toBe(429);
}, 60_000);

it("gives no second trial through an alias or after delete and re-register", async () => {
  const first = await signUp("farm@gmail.com");
  const cookie = first.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const hasTrial = async (email: string) => (await db.query("SELECT 1 FROM entitlements WHERE user_id = $1", [await userIdOf(email)])).rows.length === 1;
  expect(await hasTrial("farm@gmail.com")).toBe(true);
  expect((await signUp("f.arm+again@gmail.com")).status).toBe(200);
  expect(await hasTrial("f.arm+again@gmail.com")).toBe(false);
  const deleted = await accountPost(new Request(`${SITE}/api/auth/account/delete`, { method: "POST", headers: { Origin: SITE, cookie }, body: new URLSearchParams({ confirm: "DELETE" }) }), action("delete"));
  expect(deleted.status).toBe(303);
  expect((await signUp("farm@gmail.com")).status).toBe(200);
  expect(await hasTrial("farm@gmail.com")).toBe(false);
}, 60_000);

it("lets only one of two parallel resets with the same recovery code succeed", async () => {
  await signUp("race@example.test");
  const userId = await userIdOf("race@example.test");
  const [code] = await revealInitialRecoveryCodes(holder.pool as pg.Pool, userId);
  // One connection per transaction, like a real pool: a second client waits until the first is released.
  const shared = holder.pool as pg.Pool;
  let tail = Promise.resolve();
  holder.pool = {
    query: shared.query.bind(shared),
    connect: async () => {
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const client = await shared.connect();
      return { query: client.query.bind(client), release() { release(); } };
    },
  } as unknown as pg.Pool;
  const output: string[] = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  try {
    const reset = (password: string) => recoveryPost(post("/api/auth/recovery/reset", { email: "race@example.test", code, newPassword: password }), action("reset"));
    const responses = await Promise.all([reset("Parallel Pass One 1"), reset("Parallel Pass Two 2")]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
  } finally { holder.pool = shared; write.mockRestore(); }
  expect((await db.query("SELECT 1 FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NOT NULL", [userId])).rows).toHaveLength(1);
  // The owner is told once, at the account address.
  expect(output.join("").match(/To: race@example\.test\nSubject: Your InvestBuddy password was reset/g)).toHaveLength(1);
  const works = await Promise.all(["Parallel Pass One 1", "Parallel Pass Two 2"].map(async (password) => (await authPost(post("/api/auth/sign-in/email", { email: "race@example.test", password }))).status === 200));
  expect(works.filter(Boolean)).toHaveLength(1);
}, 60_000);

it("never creates a password through recovery for an account without one", async () => {
  const userId = (await db.query<{ id: string }>("INSERT INTO users (email, email_verified) VALUES ('nopass@example.test', true) RETURNING id::text")).rows[0].id;
  await createInitialRecoveryCodes(holder.pool as pg.Pool, userId);
  const [code] = await revealInitialRecoveryCodes(holder.pool as pg.Pool, userId);
  const response = await recoveryPost(post("/api/auth/recovery/reset", { email: "nopass@example.test", code, newPassword: "Another Strong 99" }), action("reset"));
  expect(response.status).toBe(200);
  expect((await db.query("SELECT 1 FROM auth_accounts WHERE user_id = $1", [userId])).rows).toHaveLength(0);
}, 60_000);

it("serves the request shapes src/auth/client-api.ts sends", async () => {
  // A browser-like fetch: same origin, cookies kept, routed to the handlers under test.
  let jar = new Map<string, string>();
  const ip = freshIp();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("Origin", SITE);
    headers.set("x-forwarded-for", ip);
    if (jar.size) headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
    const request = new Request(`${SITE}${String(input)}`, { ...init, headers });
    const path = new URL(request.url).pathname;
    const response = path.startsWith("/api/auth/recovery/") ? await recoveryPost(request, action(path.split("/").pop()!)) : await authPost(request);
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const [name, ...rest] = pair.split("=");
      if (/Max-Age=0/i.test(value)) jar.delete(name); else jar.set(name, rest.join("="));
    }
    return response;
  }) as typeof fetch;

  const signedUp = await signUpWithPassword({ email: "Client@Example.test", password: "Correct Horse 42", callbackURL: "/en/welcome", marketing: true }, fetcher);
  expect(signedUp.kind).toBe("signed-up");
  expect(jar.get("ib_signed_in")).toBe("1");
  const userId = await userIdOf("client@example.test");
  expect((await db.query<{ granted: boolean }>("SELECT granted FROM user_consents WHERE user_id = $1 AND kind = 'marketing'", [userId])).rows).toEqual([{ granted: true }]);
  const session = jar;
  jar = new Map();
  expect((await signUpWithPassword({ email: "client@example.test", password: "Correct Horse 42", callbackURL: "/en" }, fetcher)).kind).toBe("exists");
  jar = session;

  const codes = await createRecoveryCodes(fetcher);
  expect(codes.kind).toBe("codes");
  const list = codes.kind === "codes" ? codes.codes : [];
  expect(list).toHaveLength(10);
  // Shown once; a new set needs the password on the account page.
  expect((await createRecoveryCodes(fetcher)).kind).toBe("error");

  jar = new Map();
  expect((await signInWithPassword({ email: "client@example.test", password: "wrong password 1", callbackURL: "/en" }, fetcher)).kind).toBe("wrong-credentials");
  expect((await resetWithRecoveryCode({ email: "client@example.test", code: list[0].toLowerCase(), newPassword: "Another Strong 99" }, fetcher)).kind).toBe("reset");
  expect((await signInWithPassword({ email: "client@example.test", password: "Another Strong 99", callbackURL: "/en" }, fetcher)).kind).toBe("signed-in");
  expect(jar.get("ib_signed_in")).toBe("1");
  // No Google client configured in this test: the social route answers but has no provider.
  expect((await signInWithGoogle({ callbackURL: "/en" }, fetcher)).kind).not.toBe("redirect");

  const signOut = await accountPost(new Request(`${SITE}/api/auth/account/sign-out`, { method: "POST", headers: { Origin: SITE }, body: new URLSearchParams({ locale: "en" }) }), action("sign-out"));
  expect(signOut.headers.getSetCookie()).toContain("ib_signed_in=; Path=/; Max-Age=0; SameSite=Lax");
}, 60_000);
