import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { createInitialRecoveryCodes, revealInitialRecoveryCodes, remainingRecoveryCodes, consumeRecoveryCode, regenerateRecoveryCodes } from "./recovery";
import { grantFirstTrial } from "./trial";
import { takeAuthLimit } from "./rate-limit";
import { getEntitlement } from "@/db/entitlements";
import { validPassword } from "./password";
import { createAuth, CUSTOMER_SESSION_COOKIE } from "./server";
import { planFor } from "@/entitlements/plan";

async function scratch(run: (db: PGlite, pool: pg.Pool) => Promise<void>) {
  const db = new PGlite();
  try {
    for (const name of ["001_initial.sql", "133_customer_auth.sql", "134_customer_entitlements.sql", "135_customer_recovery_codes.sql"]) {
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
  const user = await db.query<{ id: string }>("INSERT INTO users (email) VALUES ('trial@example.test') RETURNING id::text");
  const now = new Date("2026-11-09T00:00:00Z");
  expect(await grantFirstTrial(pool, user.rows[0].id, now)).toBe(true);
  expect(await grantFirstTrial(pool, user.rows[0].id, now)).toBe(false);
  expect((await getEntitlement(pool, user.rows[0].id, new Date("2026-11-22T00:00:00Z"))).tier).toBe("plus");
  expect(planFor(await getEntitlement(pool, user.rows[0].id, new Date("2026-11-22T00:00:00Z"))).plan).toBe("trial");
  expect((await getEntitlement(pool, user.rows[0].id, new Date("2026-11-23T00:00:00Z"))).tier).toBe("free");
  // Idempotent after expiry too: the old row blocks a second trial.
  expect(await grantFirstTrial(pool, user.rows[0].id, new Date("2026-12-01T00:00:00Z"))).toBe(false);
  vi.stubEnv("TRIAL", "off");
  const other = await db.query<{ id: string }>("INSERT INTO users (email) VALUES ('notrial@example.test') RETURNING id::text");
  expect(await grantFirstTrial(pool, other.rows[0].id, now)).toBe(false);
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
