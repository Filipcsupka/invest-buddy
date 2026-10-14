import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryWaitlistRepository } from "@/db/waitlist-memory";
import { MemoryMailer } from "@/mail/mailer";
import { createLimiter } from "@/security/rate-limit";
import { createSignupHandler } from "./handlers";
import { signUp, type WaitlistDeps } from "./service";
import { hashToken, unsubscribeToken, verifyUnsubscribeToken } from "./tokens";
import { submitSignup } from "./submit";

const secret = "test-secret-0123456789";
let repo: MemoryWaitlistRepository;
let mailer: MemoryMailer;
let now: number;
const deps = (): WaitlistDeps => ({ repo, mailer, secret, baseUrl: "https://invest.example.test" });

const body = (over: Record<string, unknown> = {}) => ({ email: "Person@Example.test", locale: "en", consentLaunch: true, consentWeekly: false, website: "", ...over });
const post = (payload: unknown, headers: Record<string, string> = {}) =>
  new Request("https://invest.example.test/api/waitlist", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof payload === "string" ? payload : JSON.stringify(payload) });
const handler = (limiter = createLimiter({ perMinute: 100 })) => createSignupHandler(deps, limiter);

beforeEach(() => {
  now = Date.UTC(2026, 9, 14);
  repo = new MemoryWaitlistRepository(() => now);
  mailer = new MemoryMailer();
  process.env.WAITLIST = "on";
});
afterEach(() => { delete process.env.WAITLIST; vi.restoreAllMocks(); });

describe("tokens", () => {
  it("accepts its own unsubscribe token and refuses a changed one", () => {
    const token = unsubscribeToken(42, secret);
    expect(verifyUnsubscribeToken(token, secret)).toBe(42);
    expect(verifyUnsubscribeToken(token, "other-secret-0123456789")).toBeNull();
    expect(verifyUnsubscribeToken(token.replace(/^42/, "43"), secret)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}x`, secret)).toBeNull();
    expect(verifyUnsubscribeToken("garbage", secret)).toBeNull();
  });
  it("hashes a token to 64 hex characters", () => { expect(hashToken("a")).toMatch(/^[0-9a-f]{64}$/); });
});

describe("POST /api/waitlist", () => {
  it("stores a pending row and sends one confirmation mail", async () => {
    const response = await handler()(post(body({ source: "landing", priceVariant: "9.90" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ email: "person@example.test", status: "pending", source: "landing", priceVariant: "9.90", consentLaunch: true, consentWeekly: false });
    expect(repo.rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("person@example.test");
    const link = /https:\/\/invest\.example\.test\/en\/waitlist\/confirm\?token=([\w-]+)/.exec(mailer.sent[0].text);
    expect(link).not.toBeNull();
    expect(hashToken(link![1])).toBe(repo.rows[0].tokenHash);
  });

  it("rejects an invalid email with a field name and stores nothing", async () => {
    const response = await handler()(post(body({ email: "not-an-email" })));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid body", field: "email" });
    expect(repo.rows).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("rejects missing launch consent", async () => {
    for (const consentLaunch of [false, undefined]) {
      const response = await handler()(post(body({ consentLaunch })));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ field: "consent" });
    }
    expect(repo.rows).toHaveLength(0);
  });

  it("accepts the weekly box on its own line and keeps the choice", async () => {
    await handler()(post(body({ consentWeekly: true })));
    expect(repo.rows[0].consentWeekly).toBe(true);
  });

  it("answers a filled honeypot like a success and stores nothing", async () => {
    const response = await handler()(post(body({ website: "http://spam.test" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(repo.rows).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("answers the 6th request in a minute with 429", async () => {
    const limited = handler(createLimiter({ perMinute: 5 }));
    for (let i = 0; i < 5; i += 1) expect((await limited(post(body({ email: `p${i}@example.test` }), { "x-forwarded-for": "203.0.113.9" }))).status).toBe(200);
    const sixth = await limited(post(body({ email: "p6@example.test" }), { "x-forwarded-for": "203.0.113.9" }));
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(repo.rows).toHaveLength(5);
  });

  it("does not send a second mail within 24 hours, and gives the same answer", async () => {
    const run = handler();
    const first = await run(post(body()));
    const second = await run(post(body({ email: "PERSON@example.test" })));
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.json());
    expect(mailer.sent).toHaveLength(1);
    expect(repo.rows).toHaveLength(1);
    now += 25 * 3_600_000;
    await run(post(body()));
    expect(mailer.sent).toHaveLength(2);
  });

  it("gives a confirmed address the same answer and sends nothing", async () => {
    const run = handler();
    await run(post(body()));
    repo.rows[0].status = "confirmed";
    now += 48 * 3_600_000;
    const again = await run(post(body()));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(1);
  });

  it("lets the next sign-up retry after the mail provider failed", async () => {
    const run = handler();
    mailer.failWith = new Error("provider down");
    expect((await run(post(body()))).status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
    mailer.failWith = null;
    await run(post(body()));
    expect(mailer.sent).toHaveLength(1);
  });

  it("is closed with the flag off, and unavailable without a database", async () => {
    process.env.WAITLIST = "off";
    expect((await handler()(post(body()))).status).toBe(404);
    process.env.WAITLIST = "on";
    expect((await createSignupHandler(() => null, createLimiter({ perMinute: 100 }))(post(body()))).status).toBe(503);
    expect((await createSignupHandler(() => { throw new Error("no secret"); }, createLimiter({ perMinute: 100 }))(post(body()))).status).toBe(503);
  });

  it("refuses bad JSON, a big body and a long label", async () => {
    expect((await handler()(post("{nope"))).status).toBe(400);
    expect((await handler()(post(JSON.stringify(body({ email: `${"a".repeat(5000)}@example.test` }))))).status).toBe(413);
    expect((await handler()(post(body({ source: "x y!" })))).status).toBe(400);
  });

  it("keeps the address out of the log lines the route writes", async () => {
    const { logIngestRequest } = await import("@/app/api/ingest/request-log");
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const run = handler();
    await logIngestRequest("/api/waitlist", post(body()), () => run(post(body())));
    await logIngestRequest("/api/waitlist", post(body()), () => run(post(body({ email: "bad" }))));
    const logged = [...out.mock.calls, ...err.mock.calls].map((call) => String(call[0])).join("");
    expect(logged).toContain("/api/waitlist");
    expect(logged.toLowerCase()).not.toContain("person@example.test");
    expect(logged).not.toContain("token=");
  });
});

describe("signUp", () => {
  it("reports what happened", async () => {
    const input = { email: "a@example.test", locale: "sk" as const, consentLaunch: true, consentWeekly: false, consentTextVersion: "v0" };
    expect(await signUp(deps(), input)).toBe("sent");
    expect(await signUp(deps(), input)).toBe("skipped");
    expect(mailer.sent[0].subject).toMatch(/Potvrďte/);
    expect(mailer.sent[0].text).toContain("https://invest.example.test/sk/waitlist/confirm?token=");
    expect(mailer.sent[0].text).toContain("https://invest.example.test/sk/waitlist/unsubscribe?token=");
  });
});

describe("submitSignup", () => {
  const payload = { email: "a@example.test", locale: "en" as const, consentLaunch: true, consentWeekly: false, website: "" };
  const reply = (status: number, json: unknown = {}) => (async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
  it("maps the answers to form states", async () => {
    expect(await submitSignup(payload, reply(200, { ok: true }))).toBe("ok");
    expect(await submitSignup(payload, reply(400, { field: "email" }))).toBe("email");
    expect(await submitSignup(payload, reply(400, { field: "consent" }))).toBe("consent");
    expect(await submitSignup(payload, reply(400, { field: "form" }))).toBe("error");
    expect(await submitSignup(payload, reply(429))).toBe("rate");
    expect(await submitSignup(payload, reply(503))).toBe("error");
    expect(await submitSignup(payload, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("error");
  });
});
