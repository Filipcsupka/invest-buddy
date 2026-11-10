import { describe, expect, it, vi } from "vitest";
import { PASSWORD_MIN, RECOVERY_CODE_COUNT, callbackError, createRecoveryCodes, hasSessionHint, normalizeCode, recoveryCodesFile, resetWithRecoveryCode, safeNext, sendMagicLink, signInWithGoogle, signInWithPassword, signUpWithPassword, validEmail } from "./client-api";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("safeNext", () => {
  it.each([
    ["/en/scanner", "/en/scanner"],
    ["/sk/company/HBLS?tab=rules", "/sk/company/HBLS?tab=rules"],
    ["https://evil.example/", "/en"],
    ["//evil.example/x", "/en"],
    ["/\\evil.example", "/en"],
    ["javascript:alert(1)", "/en"],
    ["/en/\u0000x", "/en"],
    ["/api/auth/sign-out", "/en"],
    ["", "/en"],
    [null, "/en"],
  ])("%s -> %s", (input, expected) => expect(safeNext(input, "/en")).toBe(expected));
});

it("checks email shape loosely", () => {
  expect(validEmail("jana@example.com")).toBe(true);
  expect(validEmail(" jana@example.sk ")).toBe(true);
  for (const bad of ["", "jana", "jana@", "@example.com", "jana@example", "a b@example.com"]) expect(validEmail(bad), bad).toBe(false);
});

it("maps callback errors to UI states", () => {
  expect(callbackError("EXPIRED_TOKEN")).toBe("expired");
  expect(callbackError("INVALID_TOKEN")).toBe("expired");
  expect(callbackError("access_denied")).toBe("denied");
  expect(callbackError("too_many_requests")).toBe("rate-limited");
  expect(callbackError("something_else")).toBe("error");
  expect(callbackError(null)).toBeNull();
});

it("reads the session hint cookie for display only", () => {
  expect(hasSessionHint("a=1; ib_signed_in=1")).toBe(true);
  expect(hasSessionHint("a=1; other=ib_signed_in")).toBe(false);
});

describe("signInWithGoogle", () => {
  it("posts provider google with the callback and returns the provider URL", async () => {
    const fetcher = vi.fn(async () => json(200, { url: "https://accounts.google.com/o/oauth2/auth?x=1", redirect: false }));
    const out = await signInWithGoogle({ callbackURL: "/en", errorCallbackURL: "/en/sign-in" }, fetcher as typeof fetch);
    expect(out).toEqual({ kind: "redirect", url: "https://accounts.google.com/o/oauth2/auth?x=1" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/social");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ provider: "google", callbackURL: "/en", errorCallbackURL: "/en/sign-in" });
  });

  it("degrades to unavailable while no auth handler exists", async () => {
    expect(await signInWithGoogle({ callbackURL: "/en" }, (async () => new Response("<html>Not found</html>", { status: 404, headers: { "content-type": "text/html" } })) as typeof fetch)).toEqual({ kind: "unavailable" });
    expect(await signInWithGoogle({ callbackURL: "/en" }, (async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch)).toEqual({ kind: "unavailable" });
    // A non-https redirect target is refused.
    expect(await signInWithGoogle({ callbackURL: "/en" }, (async () => json(200, { url: "javascript:alert(1)" })) as typeof fetch)).toEqual({ kind: "unavailable" });
  });

  it("reports a network failure instead of throwing", async () => {
    expect(await signInWithGoogle({ callbackURL: "/en" }, (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch)).toEqual({ kind: "network" });
  });
});

describe("signUpWithPassword", () => {
  const input = { email: " jana@example.com ", password: "correct horse battery", callbackURL: "/en" };

  it("checks email and the length rule before any request", async () => {
    const fetcher = vi.fn();
    expect(await signUpWithPassword({ ...input, email: "nope" }, fetcher as unknown as typeof fetch)).toEqual({ kind: "invalid-email" });
    expect(await signUpWithPassword({ ...input, password: "a".repeat(PASSWORD_MIN - 1) }, fetcher as unknown as typeof fetch)).toEqual({ kind: "weak-password" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts to sign-up/email and returns recovery codes when the handler includes them", async () => {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, (_, i) => `CODE${i}ABCD`);
    const fetcher = vi.fn(async () => json(200, { token: "t", user: { id: "1" }, recoveryCodes: codes }));
    expect(await signUpWithPassword(input, fetcher as typeof fetch)).toEqual({ kind: "signed-up", recoveryCodes: codes });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-up/email");
    expect(JSON.parse(String(init.body))).toEqual({ name: "jana", email: "jana@example.com", password: "correct horse battery", callbackURL: "/en" });
    expect(await signUpWithPassword(input, (async () => json(200, { token: "t" })) as typeof fetch)).toEqual({ kind: "signed-up", recoveryCodes: null });
  });

  it("maps an existing account, a server-side weak password and a missing handler", async () => {
    expect(await signUpWithPassword(input, (async () => json(422, { code: "USER_ALREADY_EXISTS" })) as typeof fetch)).toEqual({ kind: "exists" });
    expect(await signUpWithPassword(input, (async () => json(400, { code: "PASSWORD_TOO_SHORT" })) as typeof fetch)).toEqual({ kind: "weak-password" });
    expect(await signUpWithPassword(input, (async () => new Response("", { status: 404 })) as typeof fetch)).toEqual({ kind: "unavailable" });
  });
});

describe("signInWithPassword", () => {
  const input = { email: "jana@example.com", password: "correct horse battery", callbackURL: "/sk/scanner" };

  it("posts to sign-in/email and signs in", async () => {
    const fetcher = vi.fn(async () => json(200, { redirect: false, token: "t", user: { id: "1" } }));
    expect(await signInWithPassword(input, fetcher as typeof fetch)).toEqual({ kind: "signed-in", url: null });
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe("/api/auth/sign-in/email");
  });

  it("says wrong credentials on 401 and passes Retry-After on 429", async () => {
    expect(await signInWithPassword(input, (async () => json(401, { code: "INVALID_EMAIL_OR_PASSWORD" })) as typeof fetch)).toEqual({ kind: "wrong-credentials" });
    expect(await signInWithPassword(input, (async () => json(429, {}, { "retry-after": "42" })) as typeof fetch)).toEqual({ kind: "rate-limited", retryAfter: 42 });
    expect(await signInWithPassword(input, (async () => json(429, {}, { "x-retry-after": "99999" })) as typeof fetch)).toEqual({ kind: "rate-limited", retryAfter: 3600 });
    expect(await signInWithPassword(input, (async () => json(500, { code: "X" })) as typeof fetch)).toEqual({ kind: "error", status: 500 });
    expect(await signInWithPassword(input, (async () => { throw new TypeError("offline"); }) as typeof fetch)).toEqual({ kind: "network" });
  });
});

describe("recovery", () => {
  it("creates codes and degrades when the endpoint is missing", async () => {
    expect(await createRecoveryCodes((async () => json(200, { codes: ["A1B2C3D4E5", "F6G7H8J9K0"] })) as typeof fetch)).toEqual({ kind: "codes", codes: ["A1B2C3D4E5", "F6G7H8J9K0"] });
    expect(await createRecoveryCodes((async () => new Response("", { status: 404 })) as typeof fetch)).toEqual({ kind: "unavailable" });
    expect(await createRecoveryCodes((async () => json(200, { codes: [] })) as typeof fetch)).toEqual({ kind: "unavailable" });
  });

  it("resets with a normalized code and maps a bad code", async () => {
    const fetcher = vi.fn(async () => json(200, { remaining: 9 }));
    expect(await resetWithRecoveryCode({ email: "jana@example.com", code: " a1b2-c3d4 e5 ", newPassword: "new long password" }, fetcher as typeof fetch)).toEqual({ kind: "reset", remaining: 9 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/recovery/reset");
    expect(JSON.parse(String(init.body))).toEqual({ email: "jana@example.com", code: "A1B2C3D4E5", newPassword: "new long password" });
    expect(await resetWithRecoveryCode({ email: "jana@example.com", code: "A1B2C3D4E5", newPassword: "new long password" }, (async () => json(400, { code: "INVALID_RECOVERY_CODE" })) as typeof fetch)).toEqual({ kind: "bad-code" });
    expect(await resetWithRecoveryCode({ email: "jana@example.com", code: "A1", newPassword: "new long password" }, vi.fn() as unknown as typeof fetch)).toEqual({ kind: "bad-code" });
    expect(await resetWithRecoveryCode({ email: "jana@example.com", code: "A1B2C3D4E5", newPassword: "short" }, vi.fn() as unknown as typeof fetch)).toEqual({ kind: "weak-password" });
    expect(await resetWithRecoveryCode({ email: "jana@example.com", code: "A1B2C3D4E5", newPassword: "new long password" }, (async () => json(429, {})) as typeof fetch)).toEqual({ kind: "rate-limited", retryAfter: null });
  });

  it("writes the download file with every code numbered", () => {
    const file = recoveryCodesFile(["AAA", "BBB"], "Header");
    expect(file).toBe("Header\n\n 1. AAA\n 2. BBB\n");
    expect(normalizeCode("ab-cd ef")).toBe("ABCDEF");
  });
});

describe("sendMagicLink (off by default)", () => {
  it("still degrades gracefully", async () => {
    expect(await sendMagicLink({ email: "nope", callbackURL: "/en" }, vi.fn() as unknown as typeof fetch)).toEqual({ kind: "invalid-email" });
    expect(await sendMagicLink({ email: "jana@example.com", callbackURL: "/en" }, (async () => json(200, { status: true })) as typeof fetch)).toEqual({ kind: "sent" });
    expect(await sendMagicLink({ email: "jana@example.com", callbackURL: "/en" }, (async () => new Response("", { status: 501 })) as typeof fetch)).toEqual({ kind: "unavailable" });
  });
});
