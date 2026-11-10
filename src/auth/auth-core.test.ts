import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { createInitialRecoveryCodes, revealInitialRecoveryCodes, remainingRecoveryCodes, consumeRecoveryCode, regenerateRecoveryCodes } from "./recovery";
import { canonicalEmail, grantFirstTrial } from "./trial";
import { authClientIp, takeAuthLimit } from "./rate-limit";
import { getEntitlement } from "@/db/entitlements";
import { validPassword } from "./password";
import { assertAuthConfig, createAuth, CUSTOMER_SESSION_COOKIE } from "./server";
import { deleteUser } from "@/db/users";
import { flags } from "@/config/flags";
import type { GoogleProfile } from "better-auth/social-providers";
import { planFor } from "@/entitlements/plan";

async function scratch(run: (db: PGlite, pool: pg.Pool) => Promise<void>) {
  const db = new PGlite();
  try {
    for (const name of ["001_initial.sql", "133_customer_auth.sql", "134_customer_entitlements.sql", "135_customer_recovery_codes.sql", "136_trial_claims.sql"]) {
      await db.exec(readFileSync(join(process.cwd(), "migrations", name), "utf8"));
    }
    const query = async (sql: string, params?: unknown[]) => {
      const result = await db.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    };
    const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool;
    await run(db, pool);
  } finally { await db.close(); }
}

afterEach(() => { vi.unstubAllEnvs(); });

it("issues one-time recovery codes and invalidates the old set", () => scratch(async (db, pool) => {
  vi.stubEnv("AUTH_SECRET", "a-test-secret-of-at-least-thirty-two-characters");
  const user = await db.query<{ id: string }>("INSERT INTO users (email) VALUES ('recovery@example.test') RETURNING id::text");
  const userId = user.rows[0].id;
  await createInitialRecoveryCodes(pool, userId);
  expect(await remainingRecoveryCodes(pool, userId)).toBe(10);
  const codes = await revealInitialRecoveryCodes(pool, userId);
  expect(codes).toHaveLength(10);
  expect(new Set(codes).size).toBe(10);
  expect(await revealInitialRecoveryCodes(pool, userId)).toEqual([]);
  const client = await pool.connect();
  expect(await consumeRecoveryCode(client, userId, codes[0])).toBe(true);
  expect(await consumeRecoveryCode(client, userId, codes[0])).toBe(false);
  expect(await remainingRecoveryCodes(pool, userId)).toBe(9);
  const replacement = await regenerateRecoveryCodes(pool, userId);
  expect(replacement).toHaveLength(10);
  expect(await consumeRecoveryCode(client, userId, codes[1])).toBe(false);
  expect(await consumeRecoveryCode(client, userId, replacement[0])).toBe(true);
}), 60_000);

it("grants a 14-day trial once and expires to Free", () => scratch(async (db, pool) => {
  vi.stubEnv("BILLING", "off"); vi.stubEnv("TRIAL", "on");
  vi.stubEnv("AUTH_SECRET", "a-test-secret-of-at-least-thirty-two-characters");
  const user = await db.query<{ id: string }>("INSERT INTO users (email) VALUES ('trial@example.test') RETURNING id::text");
  const now = new Date("2026-11-09T00:00:00Z");
  expect(await grantFirstTrial(pool, user.rows[0].id, "trial@example.test", now)).toBe(true);
  expect(await grantFirstTrial(pool, user.rows[0].id, "trial@example.test", now)).toBe(false);
  expect((await getEntitlement(pool, user.rows[0].id, new Date("2026-11-22T00:00:00Z"))).tier).toBe("plus");
  expect(planFor(await getEntitlement(pool, user.rows[0].id, new Date("2026-11-22T00:00:00Z"))).plan).toBe("trial");
  expect((await getEntitlement(pool, user.rows[0].id, new Date("2026-11-23T00:00:00Z"))).tier).toBe("free");
  // Idempotent after expiry too: the old row blocks a second trial.
  expect(await grantFirstTrial(pool, user.rows[0].id, "trial@example.test", new Date("2026-12-01T00:00:00Z"))).toBe(false);
  vi.stubEnv("TRIAL", "off");
  const other = await db.query<{ id: string }>("INSERT INTO users (email) VALUES ('notrial@example.test') RETURNING id::text");
  expect(await grantFirstTrial(pool, other.rows[0].id, "notrial@example.test", now)).toBe(false);
  expect((await getEntitlement(pool, other.rows[0].id, now)).tier).toBe("free");
}), 60_000);

it("shares email and IP limits through the database and rejects common passwords", () => scratch(async (_db, pool) => {
  vi.stubEnv("AUTH_SECRET", "a-test-secret-of-at-least-thirty-two-characters");
  expect(await takeAuthLimit(pool, "email", "Person@Example.test", 2, 3600, 100_000)).toBe(true);
  expect(await takeAuthLimit(pool, "email", "person@example.test", 2, 3600, 100_100)).toBe(true);
  expect(await takeAuthLimit(pool, "email", "person@example.test", 2, 3600, 100_200)).toBe(false);
  expect(await takeAuthLimit(pool, "ip", "person@example.test", 2, 3600, 100_200)).toBe(true);
  expect(validPassword("password123")).toBe(false);
  expect(validPassword("Correct Horse 42")).toBe(true);
}), 60_000);

it("signs up with a password, sets hardened cookies, records consent and a trial, and rejects forged and expired sessions", () => scratch(async (db, pool) => {
  vi.stubEnv("AUTH_SECRET", "a-test-secret-of-at-least-thirty-two-characters");
  vi.stubEnv("AUTH_URL", "https://invest.example.test");
  vi.stubEnv("AUTH", "on");
  vi.stubEnv("TRIAL", "on");
  const auth = createAuth(pool);
  const response = await auth.handler(new Request("https://invest.example.test/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://invest.example.test" },
    body: JSON.stringify({ name: "Tester", email: "tester@example.test", password: "Correct Horse 42" }),
  }));
  expect(response.status).toBe(200);
  const setCookies = response.headers.getSetCookie();
  const sessionCookie = setCookies.find((value) => value.startsWith(`${CUSTOMER_SESSION_COOKIE}=`));
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie).toMatch(/; HttpOnly/i);
  expect(sessionCookie).toMatch(/; Secure/i);
  expect(sessionCookie).toMatch(/; SameSite=Lax/i);
  expect(sessionCookie).toMatch(/; Path=\//);
  expect(sessionCookie).not.toMatch(/; Domain=/i);
  expect(Number(sessionCookie?.match(/Max-Age=(\d+)/i)?.[1])).toBe(30 * 86_400);
  expect(setCookies.every((value) => value.startsWith("__Host-ib_"))).toBe(true);
  const cookie = sessionCookie!.split(";")[0].slice(CUSTOMER_SESSION_COOKIE.length + 1);

  const user = await db.query<{ id: string; terms_version: string | null }>("SELECT id::text, terms_version FROM users WHERE email = 'tester@example.test'");
  const userId = user.rows[0].id;
  expect(user.rows[0].terms_version).toBe("2026-11-launch-1");
  const consents = await db.query<{ kind: string; granted: boolean }>("SELECT kind, granted FROM user_consents WHERE user_id = $1", [userId]);
  expect(consents.rows).toEqual([{ kind: "terms", granted: true }]);
  expect((await db.query<{ marketing_consent_at: Date | null }>("SELECT marketing_consent_at FROM users WHERE id = $1", [userId])).rows[0].marketing_consent_at).toBeNull();
  expect(planFor(await getEntitlement(pool, userId)).plan).toBe("trial");
  expect(await remainingRecoveryCodes(pool, userId)).toBe(10);

  const valid = await auth.api.getSession({ headers: new Headers({ cookie: `${CUSTOMER_SESSION_COOKIE}=${cookie}` }) });
  expect(valid?.user.email).toBe("tester@example.test");
  expect(await auth.api.getSession({ headers: new Headers({ cookie: `${CUSTOMER_SESSION_COOKIE}=forged` }) })).toBeNull();
  const [token] = decodeURIComponent(cookie).split(".");
  expect(await auth.api.getSession({ headers: new Headers({ cookie: `${CUSTOMER_SESSION_COOKIE}=${token}.forgedsignature` }) })).toBeNull();
  await db.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second'");
  const expired = await auth.api.getSession({ headers: new Headers({ cookie: `${CUSTOMER_SESSION_COOKIE}=${cookie}` }), query: { disableCookieCache: true } });
  expect(expired).toBeNull();

  // A second session must not add another terms row.
  await db.query("DELETE FROM auth_sessions");
  const again = await auth.handler(new Request("https://invest.example.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://invest.example.test" },
    body: JSON.stringify({ email: "tester@example.test", password: "Correct Horse 42" }),
  }));
  expect(again.status).toBe(200);
  expect((await db.query("SELECT 1 FROM user_consents WHERE user_id = $1", [userId])).rows).toHaveLength(1);

  const badOrigin = await auth.handler(new Request("https://invest.example.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example", cookie: `${CUSTOMER_SESSION_COOKIE}=${cookie}` },
    body: JSON.stringify({ email: "tester@example.test", password: "Correct Horse 42" }),
  }));
  expect(badOrigin.status).toBe(403);
}), 60_000);

const SECRET = "a-test-secret-of-at-least-thirty-two-characters";
const ORIGIN = "https://invest.example.test";
const authPost = (path: string, body: unknown, cookie?: string) => new Request(`${ORIGIN}/api/auth${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
function stubAuthEnv(extra: Record<string, string> = {}) {
  vi.stubEnv("AUTH_SECRET", SECRET); vi.stubEnv("AUTH_URL", ORIGIN); vi.stubEnv("AUTH", "on"); vi.stubEnv("TRIAL", "on");
  vi.stubEnv("MAIL_PROVIDER", "console");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
}

it("canonicalises emails for trial dedupe", () => {
  expect(canonicalEmail(" F.A.R.M.E.R+promo@GoogleMail.com ")).toBe("farmer@gmail.com");
  expect(canonicalEmail("first.last+x@example.test")).toBe("first.last@example.test");
  expect(canonicalEmail("ＰＥＲＳＯＮ@example.test")).toBe("person@example.test");
});

it("gives no second trial to an alias, a Gmail dot variant or a deleted and re-registered address", () => scratch(async (db, pool) => {
  vi.stubEnv("AUTH_SECRET", SECRET); vi.stubEnv("TRIAL", "on");
  const add = async (email: string) => (await db.query<{ id: string }>("INSERT INTO users (email) VALUES ($1) RETURNING id::text", [email])).rows[0].id;
  const first = await add("farmer@gmail.com");
  expect(await grantFirstTrial(pool, first, "farmer@gmail.com")).toBe(true);
  expect(await grantFirstTrial(pool, await add("farmer+2@gmail.com"), "farmer+2@gmail.com")).toBe(false);
  expect(await grantFirstTrial(pool, await add("f.armer@googlemail.com"), "f.armer@googlemail.com")).toBe(false);
  await deleteUser(pool, first);
  expect((await db.query("SELECT 1 FROM trial_claims")).rows).toHaveLength(1);
  const again = await add("farmer@gmail.com");
  expect(await grantFirstTrial(pool, again, "farmer@gmail.com")).toBe(false);
  expect((await getEntitlement(pool, again)).tier).toBe("free");
  // The claim holds a keyed digest, not the address.
  expect(JSON.stringify((await db.query("SELECT * FROM trial_claims")).rows)).not.toContain("farmer");
  expect(await grantFirstTrial(pool, await add("someone.else@gmail.com"), "someone.else@gmail.com")).toBe(true);
}), 60_000);

it("normalises rate-limit keys with NFKC and case", () => scratch(async (_db, pool) => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  expect(await takeAuthLimit(pool, "email", "ＰＥＲＳＯＮ@example.test", 1, 3600, 100_000)).toBe(true);
  expect(await takeAuthLimit(pool, "email", "person@EXAMPLE.test", 1, 3600, 100_100)).toBe(false);
}), 60_000);

it("takes the client IP from the trusted end of X-Forwarded-For and ignores spoofable headers", () => {
  vi.stubEnv("RATE_LIMIT_TRUSTED_HOPS", "1");
  expect(authClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.5" }))).toBe("203.0.113.5");
  expect(authClientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("unknown");
  vi.stubEnv("RATE_LIMIT_TRUSTED_HOPS", "2");
  expect(authClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.5, 10.0.0.2" }))).toBe("203.0.113.5");
  // Fewer entries than trusted proxies: the request skipped a proxy, so it gets the shared bucket.
  expect(authClientIp(new Headers({ "x-forwarded-for": "1.1.1.1" }))).toBe("unknown");
});

it("refuses MAGIC_LINK without EMAIL_VERIFY", () => {
  expect(() => assertAuthConfig(flags({ MAGIC_LINK: "on", EMAIL_VERIFY: "off" }))).toThrow(/EMAIL_VERIFY/);
  expect(() => assertAuthConfig(flags({ MAGIC_LINK: "on", EMAIL_VERIFY: "on" }))).not.toThrow();
  expect(() => assertAuthConfig(flags({}))).not.toThrow();
});

it("does not link Google to an unverified password account, and links once the email is verified", () => scratch(async (db, pool) => {
  stubAuthEnv();
  const auth = createAuth(pool, { google: {
    clientId: "test-client", clientSecret: "test-secret",
    verifyIdToken: async () => true,
    getUserInfo: async () => ({ user: { email: "victim@example.test", emailVerified: true, name: "Victim" }, data: { sub: "google-sub-1", email: "victim@example.test", email_verified: true } as GoogleProfile }),
  } });
  expect((await auth.handler(authPost("/sign-up/email", { name: "Attacker", email: "victim@example.test", password: "Correct Horse 42" }))).status).toBe(200);
  const userId = (await db.query<{ id: string }>("SELECT id::text FROM users WHERE email = 'victim@example.test'")).rows[0].id;
  const google = () => auth.handler(authPost("/sign-in/social", { provider: "google", idToken: { token: "header.payload.signature" } }));
  const refused = await google();
  expect(refused.status).toBe(401);
  expect(await refused.text()).toContain("account not linked");
  expect((await db.query("SELECT 1 FROM auth_accounts WHERE user_id = $1 AND provider_id = 'google'", [userId])).rows).toHaveLength(0);
  expect((await db.query("SELECT 1 FROM users")).rows).toHaveLength(1);
  // Control: the same sign-in links once the local email is verified, so the refusal above is the verification gate.
  await db.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]);
  const linked = await google();
  expect(linked.status).toBe(200);
  expect((await db.query("SELECT 1 FROM auth_accounts WHERE user_id = $1 AND provider_id = 'google'", [userId])).rows).toHaveLength(1);
}), 60_000);

it("strips the pre-registered password, recovery codes and sessions when a magic link proves the address", () => scratch(async (db, pool) => {
  stubAuthEnv({ MAGIC_LINK: "on", EMAIL_VERIFY: "on" });
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  try {
    const auth = createAuth(pool);
    expect((await auth.handler(authPost("/sign-up/email", { name: "Attacker", email: "owner@example.test", password: "Correct Horse 42" }))).status).toBe(200);
    const userId = (await db.query<{ id: string }>("SELECT id::text FROM users WHERE email = 'owner@example.test'")).rows[0].id;
    expect(await remainingRecoveryCodes(pool, userId)).toBe(10);
    // EMAIL_VERIFY on: no trial before the address is proven.
    expect((await getEntitlement(pool, userId)).tier).toBe("free");
    expect((await auth.handler(authPost("/sign-in/email", { email: "owner@example.test", password: "Correct Horse 42" }))).status).toBe(403);

    expect((await auth.handler(authPost("/sign-in/magic-link", { email: "owner@example.test" }))).status).toBe(200);
    const token = output.join("").match(/magic-link\?token=([^\s&]+)/)?.[1];
    expect(token).toBeTruthy();
    const verified = await auth.handler(new Request(`${ORIGIN}/api/auth/magic-link/verify?token=${token}`));
    expect(verified.status).toBe(200);

    expect((await db.query<{ email_verified: boolean }>("SELECT email_verified FROM users WHERE id = $1", [userId])).rows[0].email_verified).toBe(true);
    expect((await db.query("SELECT 1 FROM auth_accounts WHERE user_id = $1", [userId])).rows).toHaveLength(0);
    expect(await remainingRecoveryCodes(pool, userId)).toBe(0);
    expect((await db.query("SELECT 1 FROM auth_sessions WHERE user_id = $1", [userId])).rows).toHaveLength(1);
    expect(planFor(await getEntitlement(pool, userId)).plan).toBe("trial");
    expect((await auth.handler(authPost("/sign-in/email", { email: "owner@example.test", password: "Correct Horse 42" }))).status).toBe(401);
  } finally { vi.restoreAllMocks(); }
}), 60_000);
