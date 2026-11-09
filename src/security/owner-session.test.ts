import { describe, expect, it } from "vitest";
import { ownerAuthorized, ownerPasswordMatches } from "@/app/[locale]/owner/auth";
import { marketsViewable } from "@/markets/gate";
import { issueOwnerSession, OWNER_SESSION_COOKIE, OWNER_SESSION_SECONDS, verifyOwnerSession } from "./owner-session";

const password = "owner-test-password";
const env = { OWNER_SESSION_SECRET: "a-secret-with-at-least-thirty-two-bytes", OWNER_RESEARCH_PASSWORD: password, MARKETS_VIEWS: "on" };
const now = 1_800_000_000_000;
const token = () => issueOwnerSession(password, env, now)!;
const requestHeaders = (value: string) => new Headers({ cookie: `${OWNER_SESSION_COOKIE}=${value}` });

describe("owner session", () => {
  it("accepts a signed cookie on every path and for the markets gate", () => {
    const cookie = token();
    expect(ownerAuthorized(requestHeaders(cookie), password, env)).toBe(false); // issued in the future
    expect(verifyOwnerSession(cookie, password, env, now + 1000)).toBe(true);
    const current = issueOwnerSession(password, env)!;
    expect(ownerAuthorized(requestHeaders(current), password, env)).toBe(true);
    expect(marketsViewable(requestHeaders(current), env)).toBe(true);
  });

  it("rejects forged, tampered, expired and duplicated cookies", () => {
    const good = token();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const alteredLast = alphabet[alphabet.indexOf(good.at(-1)!) ^ 1];
    expect(verifyOwnerSession("v1.1800000000000.1800043200000.forged.forged", password, env, now)).toBe(false);
    expect(verifyOwnerSession(`${good.slice(0, -10)}${good.at(-10) === "A" ? "B" : "A"}${good.slice(-9)}`, password, env, now)).toBe(false);
    expect(verifyOwnerSession(`${good.slice(0, -1)}${alteredLast}`, password, env, now)).toBe(false);
    expect(verifyOwnerSession(good, password, env, now + 12 * 60 * 60 * 1000)).toBe(false);
    expect(ownerAuthorized(new Headers({ cookie: `${OWNER_SESSION_COOKIE}=${good}; ${OWNER_SESSION_COOKIE}=${good}` }), password, env)).toBe(false);
  });

  it("fails closed without an independent secret and after password rotation", () => {
    expect(issueOwnerSession(password, {})).toBeNull();
    expect(verifyOwnerSession(token(), password, {}, now)).toBe(false);
    expect(verifyOwnerSession(token(), "new-password", env, now)).toBe(false);
    expect(issueOwnerSession(password, { OWNER_SESSION_SECRET: "short" })).toBeNull();
  });

  it("keeps Basic authentication and constant-time password comparison", () => {
    const basic = `Basic ${Buffer.from(`owner:${password}`).toString("base64")}`;
    expect(ownerAuthorized(basic, password, {})).toBe(true);
    expect(ownerAuthorized(`Basic ${Buffer.from("other:owner-test-password").toString("base64")}`, password, {})).toBe(false);
    expect(ownerPasswordMatches("wrong", password)).toBe(false);
  });
});

it("allows at most 60 seconds of issued-at skew without extending expiry", () => {
  const good = token();
  expect(verifyOwnerSession(good, password, env, now - 60_000)).toBe(true);
  expect(verifyOwnerSession(good, password, env, now - 60_001)).toBe(false);
  const expires = now + OWNER_SESSION_SECONDS * 1000;
  expect(verifyOwnerSession(good, password, env, expires - 1)).toBe(true);
  expect(verifyOwnerSession(good, password, env, expires)).toBe(false);
  expect(verifyOwnerSession(good, password, env, expires + 1)).toBe(false);
});

it("revokes existing sessions when the signing secret rotates", () => {
  expect(verifyOwnerSession(token(), password, { ...env, OWNER_SESSION_SECRET: "another-secret-with-at-least-thirty-two-bytes" }, now)).toBe(false);
});
